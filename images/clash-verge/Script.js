// Global extension script for clash-verge-rev
// This script runs on the final merged config object before it is sent to Clash.

function main(config, profileName) {
    // 确保 proxy-groups / rules 存在
    if (!Array.isArray(config["proxy-groups"])) {
        config["proxy-groups"] = [];
    }

    const groups = config["proxy-groups"];
    // 从原始订阅中按地域前缀收集节点（R1、US、JP、TW、SG、HK 等）
    const regionProxies = collectRegionProxies(config);

    // 为不同服务准备不同的测速候选节点
    // GitHub：只用 R1 + H2 + H3（移除 JP / SG）
    const githubFastProxies = [
        ...(regionProxies.R1 || []),
        ...(regionProxies.H2 || []),
        ...(regionProxies.H3 || []),
    ];

    // Google / Docker：R1 + SG + H2 + H3 + JP
    const googleFastProxies = [
        ...(regionProxies.R1 || []),
        ...(regionProxies.SG || []),
        ...(regionProxies.H2 || []),
        ...(regionProxies.H3 || []),
        ...(regionProxies.JP || []),
    ];

    // -------- 2. GitHub / Google 专用测速组（Fast）--------
    // GitHub-Fast：只在 R1 + H2 + H3 中测速（不包含 JP/SG），测试地址用 GitHub 官网
    ensureUrlTestGroup(groups, {
        name: "GitHub-Fast",
        defaultProxies: githubFastProxies,
        url: "https://github.com",
        interval: 120,
        tolerance: 40,
    });

    // Google-Fast 组：使用 R1 + SG + H2 + H3 + JP，测试地址用 Google 官网
    ensureUrlTestGroup(groups, {
        name: "Google-Fast",
        defaultProxies: googleFastProxies,
        url: "https://www.google.com/generate_204",
        interval: 120,
        tolerance: 40,
    });

    // -------- 3. GitHub / Google 可手动选择的分组 --------
    // 规则会指向这些分组，你可以在 UI 中选择具体节点或对应的 *-Fast 组

    // GitHub：优先 GitHub-Fast，然后你也可以手动选具体节点（R1 + H2 + H3）
    ensureSelectGroup(groups, {
        name: "GitHub",
        defaultProxies: ["GitHub-Fast"].concat(githubFastProxies),
    });

    // Google：优先 Google-Fast
    ensureSelectGroup(groups, {
        name: "Google",
        defaultProxies: ["Google-Fast"].concat(googleFastProxies),
    });

    // -------- 4. 按地域自动创建分组（你的“地域组”）--------
    // 把原始订阅里的节点按地域前缀拆开，例如：
    //   R1:  GLaDOS-R1-*
    //   B1:  GLaDOS-B1-*
    //   US:  GLaDOS-US-*
    //   JP:  GLaDOS-JP-*
    //   TW:  GLaDOS-TW-*
    //   SG:  GLaDOS-SG-*
    //   HK:  GLaDOS-HK-*
    //   D1:  GLaDOS-D1-*
    //   S2:  GLaDOS-S2-*
    //   H2:  GLaDOS-H2-*
    //   H3:  GLaDOS-H3-*
    //
    // 对于每个地域 code（例如 US），创建两个组：
    //   1) US-Fast  : url-test，自动在该地域内测速选最快
    //   2) US       : select  ，可以在 UI 里选择 US-Fast 或具体某个 US 节点

    for (const [region, names] of Object.entries(regionProxies)) {
        if (!Array.isArray(names) || !names.length) continue;

        const fastGroupName = region + "-Fast";
        const selectGroupName = region;

        // 地域自动测速组: <region>-Fast
        ensureUrlTestGroup(groups, {
            name: fastGroupName,
            defaultProxies: names,
            url: "http://www.gstatic.cn/generate_204",
            interval: 120,
            tolerance: 40,
        });

        // 地域可选组: <region>
        ensureSelectGroup(groups, {
            name: selectGroupName,
            defaultProxies: [fastGroupName].concat(names),
        });
    }

    // -------- 5. 为 GitHub / Google 注入高优先级规则 --------
    // 参考官方文档的做法，在脚本中修改 config.rules。
    // 这里会先复制原订阅中的规则，然后把自定义规则插入到最前面。
    injectDomainRules(config, [
        // GitHub → GitHub 组
        "DOMAIN-KEYWORD,github,GitHub",
        "DOMAIN-SUFFIX,github.com,GitHub",
        "DOMAIN-SUFFIX,githubusercontent.com,GitHub",
        "DOMAIN-SUFFIX,ghcr.io,GitHub",

        // Google → Google 组
        "DOMAIN-SUFFIX,google.com,Google",
        "DOMAIN-SUFFIX,gstatic.com,Google",
        "DOMAIN-SUFFIX,googlesyndication.com,Google",
        "DOMAIN-SUFFIX,googletagmanager.com,Google",
        "DOMAIN-SUFFIX,googletagservices.com,Google",
    ]);

    return config;
}

// 保证某个 url-test 分组存在并位于 proxy-groups 前面
function ensureUrlTestGroup(groups, options) {
    const { name, defaultProxies, url, interval, tolerance } = options;

    let index = groups.findIndex((g) => g && g.name === name);
    let group;

    if (index === -1) {
        group = { name };
    } else {
        // 从原位置拿出来，稍后插到最前面
        group = groups.splice(index, 1)[0] || { name };
    }

    let proxies = Array.isArray(group.proxies) ? group.proxies.slice() : [];
    const exists = new Set(proxies);

    // 在现有基础上补齐默认候选节点
    for (const p of defaultProxies || []) {
        if (!exists.has(p)) {
            proxies.push(p);
        }
    }

    group.type = "url-test";
    group.url = url;
    group.interval = interval;
    if (typeof tolerance === "number") {
        group.tolerance = tolerance;
    }
    group.proxies = proxies;

    // 始终放到最前面，便于在 UI 中找到
    groups.unshift(group);
}

// 保证某个 select 分组存在并位于 proxy-groups 前面
function ensureSelectGroup(groups, options) {
    const { name, defaultProxies } = options;

    let index = groups.findIndex((g) => g && g.name === name);
    let group;

    if (index === -1) {
        group = { name };
    } else {
        // 从原位置拿出来，稍后插到最前面
        group = groups.splice(index, 1)[0] || { name };
    }

    // 这里直接用默认列表，保证结构稳定，也方便你在 UI 中理解
    group.type = "select";
    group.proxies = (defaultProxies || []).slice();

    // 同样放到最前面
    groups.unshift(group);
}

// 在规则列表顶部注入一批去重后的规则（保持优先匹配），并保留原订阅规则
function injectDomainRules(config, rulesToAdd) {
    const originalRules = Array.isArray(config.rules)
        ? config.rules.slice()
        : [];

    const existing = new Set(originalRules);
    const prepend = [];

    for (const rule of rulesToAdd || []) {
        if (!existing.has(rule)) {
            prepend.push(rule);
        }
    }

    config.rules = prepend.concat(originalRules);
}

// 从 config.proxies 中按地域前缀收集节点
// 约定：节点名类似 GLaDOS-US-01 / GLaDOS-JP-02 / GLaDOS-R1-03
//      取中间的 US / JP / R1 作为地域 code
function collectRegionProxies(config) {
    const result = {};

    const proxies = Array.isArray(config.proxies) ? config.proxies : [];
    for (const p of proxies) {
        if (!p || typeof p.name !== "string") continue;
        const name = p.name;
        if (!name.startsWith("GLaDOS-")) continue;

        const match = name.match(/^GLaDOS-([^-]+)-/);
        if (!match) continue;

        const region = match[1]; // 例如 R1 / US / JP / TW ...
        if (!result[region]) {
            result[region] = [];
        }
        result[region].push(name);
    }

    return result;
}
