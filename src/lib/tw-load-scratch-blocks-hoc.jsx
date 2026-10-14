import React from 'react';
import log from './log';
import LazyScratchBlocks from './tw-lazy-scratch-blocks';
import {patchThinkBlockLabel} from './make-toolbox-xml';
import LoadingSpinner from '../components/tw-loading-spinner/spinner.jsx';
import CrashMessage from '../components/crash-message/crash-message.jsx';

const LoadScratchBlocksHOC = function (WrappedComponent) {
    class LoadScratchBlocks extends React.Component {
        constructor (props) {
            super(props);
            this.state = {
                loaded: LazyScratchBlocks.isLoaded(),
                error: null
            };
            if (!this.state.loaded) {
                LazyScratchBlocks.load()
                    .then(() => {
                        // 2026-08-04：在任何toolbox/flyout第一次建置之前先patch好「思考」→
                        // 「輸出至訊息視窗」的積木顯示文字（見make-toolbox-xml.js），避免第一次
                        // 畫面出現時還是舊的「想著」字樣、要切一次分類才會更新的閃爍問題。
                        patchThinkBlockLabel();
                        this.setState({
                            loaded: true
                        });
                    })
                    .catch(e => {
                        log.error(e);
                        this.setState({
                            error: e
                        });
                    });
            }
        }
        handleReload () {
            location.reload();
        }
        render () {
            if (this.state.error !== null) {
                return (
                    <CrashMessage
                        errorMessage={`lazy scratch-blocks: ${this.state.error}`}
                        onReload={this.handleReload}
                    />
                );
            }
            if (!this.state.loaded) {
                return (
                    <LoadingSpinner />
                );
            }
            return (
                <WrappedComponent
                    {...this.props}
                />
            );
        }
    }
    return LoadScratchBlocks;
};

export default LoadScratchBlocksHOC;
