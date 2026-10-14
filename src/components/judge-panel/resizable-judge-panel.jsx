import React, {useCallback, useEffect, useRef, useState} from 'react';
import PropTypes from 'prop-types';
import VM from 'scratch-vm';
import JudgePanel from './judge-panel.jsx';
import styles from './judge-panel.css';

/**
 * 2026-09-05：包住JudgePanel的可調整寬度／可收合容器，解決「積木工作區太窄」的問題。
 * 原本gui.jsx直接把JudgePanel包在一個寫死width:400px的Box裡（見gui.css的
 * .judge-panel-wrapper，這個class已經拿掉不用），完全沒有讓使用者自己調整空間分配的
 * 方式。這裡改成：
 *   - 左邊一條可拖曳的分隔線，拖曳調整面板寬度（夾在MIN_WIDTH~MAX_WIDTH之間）。
 *   - 最左邊一個常駐的收合／展開按鈕，收合時面板縮到COLLAPSED_WIDTH，只留這顆按鈕可以點。
 *   - 寬度跟收合狀態都存localStorage，記住使用者上次調整的結果。
 *
 * 面板收合時JudgePanel本身還是掛載著（用[hidden]隱藏，不是整個unmount），評分結果、目前
 * 選的題目等內部state不會因為收合又展開而遺失。
 */

const WIDTH_STORAGE_KEY = 'osepJudgePanelWidth';
const COLLAPSED_STORAGE_KEY = 'osepJudgePanelCollapsed';
const DEFAULT_WIDTH = 400;
const MIN_WIDTH = 280;
const MAX_WIDTH = 800;
const COLLAPSED_WIDTH = 20;
// 積木工作區（editor-wrapper）在gui.css裡是flex-shrink:0、有自己的最小flex-basis，不會被
// 這個面板擠壓——但如果我們把面板拖得太寬，總寬度超過視窗，flex-wrapper的overflow:hidden
// 就會把超出的部分整個裁掉。這裡保守抓一個積木區至少要留的寬度，動態算出面板實際能拖多寬。
const MIN_EDITOR_WIDTH = 600;

const loadStoredWidth = () => {
    try {
        const raw = window.localStorage.getItem(WIDTH_STORAGE_KEY);
        const parsed = raw ? parseInt(raw, 10) : NaN;
        return Number.isFinite(parsed) ? Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, parsed)) : DEFAULT_WIDTH;
    } catch (e) {
        return DEFAULT_WIDTH;
    }
};

const loadStoredCollapsed = () => {
    try {
        return window.localStorage.getItem(COLLAPSED_STORAGE_KEY) === '1';
    } catch (e) {
        return false;
    }
};

const saveWidth = width => {
    try {
        window.localStorage.setItem(WIDTH_STORAGE_KEY, String(width));
    } catch (e) {
        // localStorage不可用就不記憶寬度，不影響當下使用
    }
};

const saveCollapsed = collapsed => {
    try {
        window.localStorage.setItem(COLLAPSED_STORAGE_KEY, collapsed ? '1' : '0');
    } catch (e) {
        // 忽略
    }
};

const ResizableJudgePanel = ({vm}) => {
    const [width, setWidth] = useState(loadStoredWidth);
    const [collapsed, setCollapsed] = useState(loadStoredCollapsed);
    const draggingRef = useRef(false);

    const handlePointerMove = useCallback(event => {
        if (!draggingRef.current) return;
        const maxAllowed = Math.max(
            MIN_WIDTH,
            Math.min(MAX_WIDTH, window.innerWidth - MIN_EDITOR_WIDTH)
        );
        // 面板在畫面右側，滑鼠往左拖（clientX變小）代表要變寬。
        const next = Math.min(maxAllowed, Math.max(MIN_WIDTH, window.innerWidth - event.clientX));
        setWidth(next);
    }, []);

    const stopDragging = useCallback(() => {
        if (!draggingRef.current) return;
        draggingRef.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        setWidth(current => {
            saveWidth(current);
            return current;
        });
    }, []);

    useEffect(() => {
        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', stopDragging);
        return () => {
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', stopDragging);
        };
    }, [handlePointerMove, stopDragging]);

    // 2026-09-05：Blockly的SVG畫布不會自己偵測容器CSS寬度變化而重繪——blocks.jsx裡
    // 兩處既有的window.dispatchEvent(new Event('resize'))就是同樣的作法（見componentDidUpdate
    // 處理stageSize/customStageSize變動時的hack）。這裡的寬度/收合狀態改變只是改了容器的CSS
    // width，Blockly完全不知道，必須手動丟一個window resize事件，它內部綁定的resize handler
    // 才會重新計算SVG尺寸——不然實測會看到「拖曳/收合右側面板有反應，但積木工作區完全沒跟著
    // 變」（使用者回報過的現象）。
    useEffect(() => {
        window.dispatchEvent(new Event('resize'));
    }, [width, collapsed]);

    const startDragging = event => {
        event.preventDefault();
        draggingRef.current = true;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    };

    const toggleCollapsed = () => {
        setCollapsed(prev => {
            const next = !prev;
            saveCollapsed(next);
            return next;
        });
    };

    return (
        <div
            className={styles.judgePanelResizableWrapper}
            style={{width: collapsed ? COLLAPSED_WIDTH : width}}
        >
            <button
                className={styles.judgePanelCollapseToggle}
                title={collapsed ? '展開題目面板' : '收合題目面板'}
                onClick={toggleCollapsed}
            >
                {collapsed ? '◀' : '▶'}
            </button>
            {!collapsed && (
                <div
                    className={styles.judgePanelResizeHandle}
                    onPointerDown={startDragging}
                />
            )}
            <div
                className={styles.judgePanelInner}
                hidden={collapsed}
            >
                <JudgePanel vm={vm} />
            </div>
        </div>
    );
};

ResizableJudgePanel.propTypes = {
    vm: PropTypes.instanceOf(VM).isRequired
};

export default ResizableJudgePanel;
