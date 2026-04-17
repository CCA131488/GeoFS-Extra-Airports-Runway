(function() {
    'use strict';

    // 确保 GeoFS 全局对象存在
    if (typeof geofs === 'undefined') {
        console.error('GeoFS 未加载，请在 GeoFS 页面中运行此脚本。');
        return;
    }

    /**
     * 添加自定义跑道（2D地图标记 + 导航数据）
     * @param {Object} options 跑道参数
     * @param {string} options.icao       机场 ICAO 代码（如 'ZSPD'）
     * @param {string} options.ident      跑道标识（如 '17L'）
     * @param {number} options.lat        跑道中心纬度（十进制）
     * @param {number} options.lon        跑道中心经度（十进制）
     * @param {number} options.heading    跑道真航向（度，如 170 表示 170°）
     * @param {number} [options.lengthFt] 跑道长度（英尺），默认 10000
     * @param {number} [options.widthFt]  跑道宽度（英尺），默认 150
     * @param {number} [options.freq]     ILS 频率（kHz），如 110.3 表示 110300，默认无
     * @param {number} [options.slope]    下滑道角度（度），默认 3.0
     * @param {boolean} [options.major]   是否为主要跑道（影响地图图标颜色），默认 true
     */
    function addCustomRunway(options) {
        // 参数校验与默认值
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
            console.error('跑道参数不完整：必须提供有效的 lat, lon, heading');
            return;
        }

        // 构造跑道名称（用于地图弹出窗口显示）
        const name = `${icao} ${ident}`;

        // 1. 构造 GeoFS 导航数据对象
        const runwayNavaid = {
            icao: icao,
            ident: ident,
            name: name,
            type: freq ? 'ILS' : 'RNW',      // 有频率则为 ILS，否则为普通跑道
            lat: lat,
            lon: lon,
            heading: heading,
            freq: freq,
            slope: slope,
            major: major,
            // 附加属性供跑道模型使用
            lengthFeet: lengthFt,
            widthFeet: widthFt
        };

        // 2. 将跑道注册到导航系统
        // geofs.nav.addNavaid 会返回一个带有 id 的跑道对象，并自动添加地图标记
        const addedRunway = geofs.nav.addNavaid(runwayNavaid);
        console.log(`跑道 ${name} 已添加到导航系统，ID: ${addedRunway.id}`);

        // 3. 手动刷新地图标记层（确保新图标立即显示）
        if (geofs.api.map && geofs.api.map.updateMarkerLayers) {
            geofs.api.map.updateMarkerLayers();
        }

        // 4. 如果存在 ILS 频率，将其添加到频率索引中，以便无线电调谐
        if (freq) {
            if (!geofs.nav.frequencies[freq]) {
                geofs.nav.frequencies[freq] = [];
            }
            geofs.nav.frequencies[freq].push(addedRunway);
        }

        // 5. （可选）如果希望该跑道也能被物理地形平整和 3D 灯光识别，
        //    需要进一步将其加入 geofs.runways 系统，但这涉及更多底层逻辑，
        //    本插件暂不实现 3D 部分，仅提供 2D 地图与导航功能。

        return addedRunway;
    }

    // 暴露到全局，方便重复调用
    window.addCustomRunway = addCustomRunway;

    console.log('✅ 自定义跑道插件已加载。使用方法：');
    console.log('addCustomRunway({');
    console.log('    icao: "ZSPD",');
    console.log('    ident: "17L",');
    console.log('    lat: 31.1434,');
    console.log('    lon: 121.8089,');
    console.log('    heading: 167,');
    console.log('    lengthFt: 13123,');
    console.log('    freq: 110.3 * 1000,  // ILS 频率，单位 kHz');
    console.log('    slope: 3.0,');
    console.log('    major: true');
    console.log('});');
})();