// GeoFS 跑道数据库管理插件
(function() {
    if (typeof geofs === 'undefined' || !geofs.majorRunwayGrid) {
        console.error('错误: geofs.majorRunwayGrid 未找到，请确保在GeoFS游戏页面中运行此脚本');
        return;
    }

    // 地球半径（公里）
    const EARTH_RADIUS = 6371;

    // 计算两点间距离（公里）
    function haversineDistance(lat1, lon1, lat2, lon2) {
        const toRad = Math.PI / 180;
        const dLat = (lat2 - lat1) * toRad;
        const dLon = (lon2 - lon1) * toRad;
        const a = Math.sin(dLat / 2) ** 2 +
                  Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) *
                  Math.sin(dLon / 2) ** 2;
        return EARTH_RADIUS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    // 获取坐标所在的网格键（基于整数部分，负零处理）
    function getGridKey(coord) {
        let key = Math.trunc(coord);
        if (key === -0) key = 0;
        return String(key);
    }

    // 寻找最近的跑道，返回其所在的网格键
    function findClosestRunwayGrid(lat, lon) {
        let minDist = Infinity;
        let targetLatKey = null;
        let targetLonKey = null;

        for (const [latKey, lonGrid] of Object.entries(geofs.majorRunwayGrid)) {
            for (const [lonKey, runways] of Object.entries(lonGrid)) {
                for (const runway of runways) {
                    const rLat = runway[4];
                    const rLon = runway[5];
                    if (rLat === undefined || rLon === undefined) continue;
                    const dist = haversineDistance(lat, lon, rLat, rLon);
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

    // 添加跑道到数据库
    function addRunway(icao, length, width, heading, lat, lon, elevation = 0) {
        if (!icao || typeof icao !== 'string') {
            console.error('错误: ICAO代码必须为非空字符串');
            return false;
        }
        if (length <= 0 || width <= 0) {
            console.error('错误: 跑道长度和宽度必须为正数');
            return false;
        }

        // 确定网格位置
        let latKey = getGridKey(lat);
        let lonKey = getGridKey(lon);
        let targetGrid = findClosestRunwayGrid(lat, lon);

        // 如果找到附近的跑道，使用其网格（确保分组一致性）
        if (targetGrid.latKey && targetGrid.lonKey) {
            latKey = targetGrid.latKey;
            lonKey = targetGrid.lonKey;
        }

        // 确保网格结构存在
        if (!geofs.majorRunwayGrid[latKey]) {
            geofs.majorRunwayGrid[latKey] = {};
        }
        if (!geofs.majorRunwayGrid[latKey][lonKey]) {
            geofs.majorRunwayGrid[latKey][lonKey] = [];
        }

        // 检查重复（基于ICAO和坐标）
        const existing = geofs.majorRunwayGrid[latKey][lonKey].find(r => r[0] === icao && Math.abs(r[4] - lat) < 0.001 && Math.abs(r[5] - lon) < 0.001);
        if (existing) {
            console.warn(`警告: 跑道 ${icao} 已存在于数据库中，未添加`);
            return false;
        }

        // 新跑道数据格式: [ICAO, 长度(ft), 宽度(ft), 航向(°), 纬度, 经度, 海拔(ft)可选]
        const newRunway = [icao, length, width, heading, lat, lon];
        if (elevation !== 0) newRunway.push(elevation);

        geofs.majorRunwayGrid[latKey][lonKey].push(newRunway);
        console.log(`成功添加跑道: ${icao} (${lat}, ${lon}) → 网格 [${latKey}][${lonKey}]`);
        return true;
    }

    // 删除跑道（通过ICAO和坐标精确匹配）
    function removeRunway(icao, lat, lon) {
        for (const [latKey, lonGrid] of Object.entries(geofs.majorRunwayGrid)) {
            for (const [lonKey, runways] of Object.entries(lonGrid)) {
                const index = runways.findIndex(r => r[0] === icao && Math.abs(r[4] - lat) < 0.001 && Math.abs(r[5] - lon) < 0.001);
                if (index !== -1) {
                    const removed = runways.splice(index, 1)[0];
                    console.log(`已删除跑道: ${removed[0]} (${removed[4]}, ${removed[5]})`);
                    // 如果该网格数组为空，可选择删除空网格（可选）
                    if (runways.length === 0) {
                        delete geofs.majorRunwayGrid[latKey][lonKey];
                        if (Object.keys(geofs.majorRunwayGrid[latKey]).length === 0) {
                            delete geofs.majorRunwayGrid[latKey];
                        }
                    }
                    return true;
                }
            }
        }
        console.warn(`未找到匹配的跑道: ${icao} (${lat}, ${lon})`);
        return false;
    }

    // 列出所有跑道（可选限制数量）
    function listRunways(limit = 50) {
        let count = 0;
        console.log('=== 跑道数据库列表 ===');
        for (const [latKey, lonGrid] of Object.entries(geofs.majorRunwayGrid)) {
            for (const [lonKey, runways] of Object.entries(lonGrid)) {
                for (const r of runways) {
                    console.log(`${r[0]} | 长度:${r[1]}ft | 宽度:${r[2]}ft | 航向:${r[3]}° | 坐标:(${r[4]}, ${r[5]})${r[6] ? ' | 海拔:'+r[6]+'ft' : ''}`);
                    if (++count >= limit) {
                        console.log(`... 共 ${count} 条记录（已达到显示限制 ${limit}）`);
                        return;
                    }
                }
            }
        }
        console.log(`总计 ${count} 条跑道记录`);
    }

    // 根据ICAO搜索跑道
    function findRunwayByICAO(icao) {
        const results = [];
        for (const [latKey, lonGrid] of Object.entries(geofs.majorRunwayGrid)) {
            for (const [lonKey, runways] of Object.entries(lonGrid)) {
                for (const r of runways) {
                    if (r[0].toUpperCase() === icao.toUpperCase()) {
                        results.push(r);
                    }
                }
            }
        }
        if (results.length === 0) {
            console.log(`未找到 ICAO 代码为 ${icao} 的跑道`);
        } else {
            console.log(`找到 ${results.length} 条匹配跑道:`);
            results.forEach(r => console.log(r));
        }
        return results;
    }

    // 批量添加跑道（参数为数组）
    function addRunwaysBatch(runwaysArray) {
        let success = 0;
        for (const r of runwaysArray) {
            if (addRunway(r[0], r[1], r[2], r[3], r[4], r[5], r[6] || 0)) success++;
        }
        console.log(`批量添加完成: 成功 ${success} / ${runwaysArray.length}`);
    }

    // 导出全局API
    window.geofsRunwayTool = {
        add: addRunway,
        remove: removeRunway,
        list: listRunways,
        find: findRunwayByICAO,
        addBatch: addRunwaysBatch,
        version: '1.0.0'
    };

    console.log('GeoFS 跑道管理插件已加载，使用 geofsRunwayTool.add(icao, length, width, heading, lat, lon, elevation) 添加跑道');
    console.log('示例: geofsRunwayTool.add("ZSSS", 11130, 144, 177.37, 31.21303, 121.33165, 10)');
})();