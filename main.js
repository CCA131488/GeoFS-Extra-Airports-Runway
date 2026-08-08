// ==UserScript==
// @name         Extra Airport Runways
// @namespace    http://tampermonkey.net/
// @version      2026-04-21
// @description  Extra Runways
// @author       CES2731 & Deepseek
// @match        https://geo-fs.com/geofs.php*
// @match        https://*.geo-fs.com/geofs.php*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=geo-fs.com
// @grant        none
// ==/UserScript==
(function() {
    'use strict';

    // ==================== ✅ 新增：等待 GeoFS 完全加载 ====================
    function waitGeoFSFull(callback) {
        const t = setInterval(() => {
            if (
                typeof geofs !== 'undefined' &&
                geofs.nav &&
                typeof geofs.nav.addNavaid === 'function' &&
                geofs.majorRunwayGrid &&
                geofs.aircraft &&
                geofs.aircraft.instance &&
                geofs.aircraft.instance.llaLocation
            ) {
                clearInterval(t);
                console.log("✅ GeoFS FULLY LOADED");
                callback();
            }
        }, 1000);
    }

    // ==================== 用户配置区域 ====================
    const CONFIG = {
        GRID_DATA_URL: 'https://raw.githubusercontent.com/CES2731/GeoFS-Extra-Airports-Runway/refs/heads/main/runways.json',
        ILS_DATA_URL: 'https://raw.githubusercontent.com/CES2731/GeoFS-Extra-Airports-Runway/refs/heads/main/ilsdata.json'
    };
    // ====================================================

    // ---------- 第一部分：跑道网格数据加载 ----------
    function getGridKey(coord) {
        let key = Math.trunc(coord);
        if (key === -0) key = 0;
        return String(key);
    }

    function findClosestRunwayGrid(lat, lon) {
        const EARTH_RADIUS = 6371;
        const toRad = Math.PI / 180;
        let minDist = Infinity;
        let targetLatKey = null, targetLonKey = null;
        for (const [latKey, lonGrid] of Object.entries(geofs.majorRunwayGrid)) {
            for (const [lonKey, runways] of Object.entries(lonGrid)) {
                for (const r of runways) {
                    const rLat = r[4], rLon = r[5];
                    if (rLat === undefined || rLon === undefined) continue;
                    const dLat = (rLat - lat) * toRad;
                    const dLon = (rLon - lon) * toRad;
                    const a = Math.sin(dLat/2)**2 + Math.cos(lat*toRad)*Math.cos(rLat*toRad)*Math.sin(dLon/2)**2;
                    const dist = EARTH_RADIUS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
                    if (dist < minDist) {
                        minDist = dist;
                        targetLatKey = latKey;
                        targetLonKey = lonKey;
                    }
                }
            }
        }
        return { latKey: targetLatKey, lonKey: targetLonKey };
    }

    function addRunwayToGrid(icao, length, width, heading, lat, lon, elevation = 0) {
        if (!icao || typeof icao !== 'string') return false;
        if (length <= 0 || width <= 0) return false;

        let latKey = getGridKey(lat);
        let lonKey = getGridKey(lon);
        const nearest = findClosestRunwayGrid(lat, lon);
        if (nearest.latKey && nearest.lonKey) {
            latKey = nearest.latKey;
            lonKey = nearest.lonKey;
        }

        if (!geofs.majorRunwayGrid[latKey]) geofs.majorRunwayGrid[latKey] = {};
        if (!geofs.majorRunwayGrid[latKey][lonKey]) geofs.majorRunwayGrid[latKey][lonKey] = [];

        const exists = geofs.majorRunwayGrid[latKey][lonKey].some(r => r[0] === icao && Math.abs(r[4]-lat) < 0.001 && Math.abs(r[5]-lon) < 0.001);
        if (exists) return false;

        const runway = [icao, length, width, heading, lat, lon];
        if (elevation !== 0) runway.push(elevation);
        geofs.majorRunwayGrid[latKey][lonKey].push(runway);
        return true;
    }

    function addBatchToGrid(runwaysArray) {
        let success = 0;
        for (const r of runwaysArray) {
            if (addRunwayToGrid(r[0], r[1], r[2], r[3], r[4], r[5], r[6] || 0)) success++;
        }
        console.log(`📊 [网格] 成功添加 ${success} / ${runwaysArray.length} 条跑道`);
        return success;
    }

    function parseAndAddToGrid(data) {
        let runwaysArray = [];
        if (Array.isArray(data)) {
            if (data.length === 0) throw new Error('JSON 数组为空');
            if (Array.isArray(data[0])) {
                runwaysArray = data;
            } else if (typeof data[0] === 'object' && data[0].icao) {
                runwaysArray = data.map(item => [item.icao, item.length, item.width, item.heading, item.lat, item.lon, item.elevation || 0]);
            } else {
                throw new Error('不支持的 JSON 数组格式');
            }
        } else if (typeof data === 'object' && data.runways && Array.isArray(data.runways)) {
            const items = data.runways;
            if (items.length === 0) throw new Error('runways 数组为空');
            if (Array.isArray(items[0])) {
                runwaysArray = items;
            } else {
                runwaysArray = items.map(item => [item.icao, item.length, item.width, item.heading, item.lat, item.lon, item.elevation || 0]);
            }
        } else {
            throw new Error('无法解析 JSON 结构');
        }
        return addBatchToGrid(runwaysArray);
    }

    async function loadGridData(url) {
        if (!url) return;
        console.log(`🗺️ 正在加载跑道网格数据: ${url}`);
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const json = await response.json();
            const added = parseAndAddToGrid(json);
            console.log(`✅ 跑道网格数据加载完成，共添加 ${added} 条`);
        } catch (err) {
            console.error('❌ 跑道网格数据加载失败:', err);
        }
    }

    // ---------- 第二部分：ILS/RNW ----------
    function addCustomRunway(options) {
        const icao = options.icao || 'CUST';
        const ident = options.ident || '00';
        const lat = parseFloat(options.lat);
        const lon = parseFloat(options.lon);
        const heading = parseFloat(options.heading);

        const runwayData = {
            icao, ident,
            name: `${icao}|${ident}|${icao}`,
            lat, lon, heading,
            lengthFeet: options.lengthFt || 10000,
            widthFeet: options.widthFt || 150,
            major: true,
            freq: options.freq,
            slope: options.slope || 3.0,
            type: 'RNW'
        };

        const addedNav = geofs.nav.addNavaid(Object.assign({}, runwayData));

        if (geofs.map?.addRunwayMarker) {
            if (addedNav.marker) addedNav.marker.destroy();
            const marker = geofs.map.addRunwayMarker(runwayData);
            addedNav.marker = marker;
        }

        if (options.freq) {
            const ilsData = Object.assign({}, runwayData, {
                type: 'ILS',
                ident: ident + 'X'
            });

            const addedILS = geofs.nav.addNavaid(ilsData);

            if (!geofs.nav.frequencies[options.freq]) {
                geofs.nav.frequencies[options.freq] = [];
            }

            geofs.nav.frequencies[options.freq].push(addedILS);
        }

        if (geofs.api?.map?.updateMarkerLayers) {
            geofs.api.map.updateMarkerLayers();
        }

        return addedNav;
    }

    async function loadILSData(url) {
        const data = await (await fetch(url)).json();
        data.forEach(addCustomRunway);
    }

    // ==================== ✅ 新增：距离卸载系统 ====================
    function startDistanceUnload() {

        const UNLOAD_KM = 260;
        const R = 6371;
        const toRad = Math.PI / 180;

        function dist(a,b,c,d){
            const dLat=(c-a)*toRad,dLon=(d-b)*toRad;
            const x=Math.sin(dLat/2)**2+Math.cos(a*toRad)*Math.cos(c*toRad)*Math.sin(dLon/2)**2;
            return R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));
        }

        setInterval(() => {

            if (!geofs.aircraft?.instance) return;

            const lat = geofs.aircraft.instance.llaLocation[0];
            const lon = geofs.aircraft.instance.llaLocation[1];

            geofs.nav.navaids = geofs.nav.navaids.filter(n => {
                const d = dist(lat, lon, n.lat, n.lon);
                return d < UNLOAD_KM;
            });

            if (geofs.map?.runwayMarkers) {
                geofs.map.runwayMarkers =
                    geofs.map.runwayMarkers.filter(m => {
                        const d = dist(lat, lon, m.lat, m.lon);
                        return d < UNLOAD_KM;
                    });
            }

        }, 5000);

        console.log("📡 距离卸载已启动");
    }

    // ==================== 主入口 ====================
    waitGeoFSFull(async () => {

        console.log('🔧 插件启动');

        await loadGridData(CONFIG.GRID_DATA_URL);
        await loadILSData(CONFIG.ILS_DATA_URL);

        startDistanceUnload();

    });

})();
