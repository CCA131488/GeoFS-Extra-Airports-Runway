(function() {
    'use strict';

    if (typeof geofs === 'undefined') {
        console.error('❌ GeoFS 未加载，请在 GeoFS 页面中运行此脚本。');
        return;
    }

    // ==================== 用户配置区域 ====================
    const CONFIG = {
        // 将下面的 URL 替换为您的 GitHub Raw JSON 文件链接
        GITHUB_RAW_URL: 'https://raw.githubusercontent.com/CES2731/GeoFS-Extra-Airports-Runway/refs/heads/main/ilsdata.json'
    };
    // ====================================================

    /**
     * 添加自定义跑道（同时生成导航数据和带有正确弹出窗口的地图标记）
     */
    function addCustomRunway(options) {
        const icao = options.icao || 'CUST';
        const ident = options.ident || '00';
        const lat = parseFloat(options.lat);
        const lon = parseFloat(options.lon);
        const heading = parseFloat(options.heading);
        const lengthFt = options.lengthFt || 10000;
        const widthFt = options.widthFt || 150;
        const freq = options.freq || null;
        const slope = options.slope || 3.0;
        const major = options.major !== false;

        if (isNaN(lat) || isNaN(lon) || isNaN(heading)) {
            console.error(`❌ 跑道参数无效: ${icao} ${ident}`);
            return null;
        }

        // 构造跑道对象（用于导航和地图标记）
        const runwayData = {
            id: null, // 稍后由导航系统分配
            icao: icao,
            ident: ident,
            name: `${icao}|${ident}|${icao}`,
            lat: lat,
            lon: lon,
            heading: heading,
            lengthFeet: lengthFt,
            widthFeet: widthFt,
            major: major,
            freq: freq,
            slope: slope,
            type: 'RNW' // 基础类型为跑道
        };

        // 1. 将跑道注册到导航系统（用于飞行计划、最近跑道计算等）
        // 注意：addNavaid 会自动调用 addNavaidMarker，但弹出窗口可能不完整，我们会手动覆盖
        const addedNav = geofs.nav.addNavaid(Object.assign({}, runwayData));
        runwayData.id = addedNav.id; // 保存分配的ID

        // 2. 手动创建/更新地图标记，确保弹出窗口使用我们的数据
        if (geofs.map && typeof geofs.map.addRunwayMarker === 'function') {
            // 如果导航系统已创建标记，先移除默认的，再手动添加
            if (addedNav.marker) {
                addedNav.marker.destroy();
            }
            // 使用正确的跑道数据创建标记
            const marker = geofs.map.addRunwayMarker(runwayData);
            // 将新标记关联到导航对象，方便后续管理
            addedNav.marker = marker;
            console.log(`🗺️ 地图标记已更新: ${icao} ${ident}`);
        } else {
            console.warn('⚠️ geofs.map.addRunwayMarker 不可用，使用默认标记');
        }

        // 3. 如果有 ILS 频率，单独添加 ILS 导航台（ILS 天线图标）
        if (freq) {
            const ilsData = {
                icao: icao,
                ident: ident + 'X',
                name: `${icao} ${ident} ILS`,
                lat: lat,
                lon: lon,
                heading: heading,
                freq: freq,
                slope: slope,
                type: 'ILS'
            };
            const addedILS = geofs.nav.addNavaid(ilsData);
            if (!geofs.nav.frequencies[freq]) {
                geofs.nav.frequencies[freq] = [];
            }
            geofs.nav.frequencies[freq].push(addedILS);
            console.log(`📡 ILS 导航台已添加: ${icao} ${ident} | 频率: ${(freq/1000).toFixed(2)} MHz`);
        }

        // 刷新地图图层
        if (geofs.api.map && geofs.api.map.updateMarkerLayers) {
            geofs.api.map.updateMarkerLayers();
        }

        return addedNav;
    }

    /**
     * 从 GitHub Raw URL 加载 JSON 数据并批量添加跑道
     */
    async function loadRunwaysFromGitHub(url) {
        console.log(`🚀 正在从 GitHub 加载跑道数据: ${url}`);
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();

            if (!Array.isArray(data)) {
                console.error('❌ JSON 格式错误：应为数组');
                return;
            }

            let successCount = 0;
            data.forEach((item, index) => {
                try {
                    const result = addCustomRunway(item);
                    if (result) successCount++;
                } catch (e) {
                    console.warn(`⚠️ 第 ${index + 1} 条数据添加失败:`, e);
                }
            });

            console.log(`🎉 批量导入完成！成功添加 ${successCount}/${data.length} 条跑道`);
        } catch (error) {
            console.error('❌ 加载失败:', error.message);
        }
    }

    // 暴露全局方法
    window.addCustomRunway = addCustomRunway;
    window.loadRunwaysFromGitHub = loadRunwaysFromGitHub;

    // 自动执行加载
    if (CONFIG.GITHUB_RAW_URL && CONFIG.GITHUB_RAW_URL !== 'https://raw.githubusercontent.com/你的用户名/仓库名/分支/runways.json') {
        loadRunwaysFromGitHub(CONFIG.GITHUB_RAW_URL);
    } else {
        console.warn('⚠️ 请先在代码开头的 CONFIG 中填写您的 GitHub Raw URL！');
    }
})();
