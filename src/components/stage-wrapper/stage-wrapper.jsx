import PropTypes from 'prop-types';
import React from 'react';
import classNames from 'classnames';
import VM from 'scratch-vm';

import Box from '../box/box.jsx';
import {STAGE_DISPLAY_SIZES} from '../../lib/layout-constants.js';
import StageHeader from '../../containers/stage-header.jsx';
import Stage from '../../containers/stage.jsx';
import Loader from '../loader/loader.jsx';

import styles from './stage-wrapper.css';

const StageWrapperComponent = function (props) {
    const {
        isEmbedded,
        isFullScreen,
        isRtl,
        isRendererSupported,
        loading,
        minimal,
        stageSize,
        vm
    } = props;

    return (
        <Box
            className={classNames(
                styles.stageWrapper,
                {
                    [styles.embedded]: isEmbedded,
                    [styles.fullScreen]: isFullScreen,
                    [styles.loading]: loading,
                    [styles.offsetControls]: !(isEmbedded || isFullScreen)
                }
            )}
            dir={isRtl ? 'rtl' : 'ltr'}
        >
            {/* 2026-08-04：手動測試（judge-manual-run.js）時只要顯示「詢問並等待」的輸入框，
                不需要開始/停止按鈕（學生應該從judge-panel的「開始手動測試」/「停止」操作，
                不是這排原生控制項），藏起來讓浮動視窗更清楚、不會太擁擠。 */}
            {minimal ? null : (
                <Box className={styles.stageMenuWrapper}>
                    <StageHeader
                        stageSize={stageSize}
                        vm={vm}
                    />
                </Box>
            )}
            <Box className={styles.stageCanvasWrapper}>
                {
                    isRendererSupported ?
                        <Stage
                            minimal={minimal}
                            stageSize={stageSize}
                            vm={vm}
                        /> :
                        null
                }
            </Box>
            {loading ? (
                <Loader isFullScreen={isFullScreen} />
            ) : null}
        </Box>
    );
};

StageWrapperComponent.propTypes = {
    isEmbedded: PropTypes.bool,
    isFullScreen: PropTypes.bool,
    isRendererSupported: PropTypes.bool.isRequired,
    isRtl: PropTypes.bool.isRequired,
    loading: PropTypes.bool,
    minimal: PropTypes.bool,
    stageSize: PropTypes.oneOf(Object.keys(STAGE_DISPLAY_SIZES)).isRequired,
    vm: PropTypes.instanceOf(VM).isRequired
};

export default StageWrapperComponent;
