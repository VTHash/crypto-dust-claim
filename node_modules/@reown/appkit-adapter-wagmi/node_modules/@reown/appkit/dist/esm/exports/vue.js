import { AppKit } from '../src/client.js';
import { getAppKit } from '../src/library/vue/index.js';
import packageJson from '../package.json' assert { type: 'json' };
import { CoreHelperUtil } from '@reown/appkit-core';
// -- Views ------------------------------------------------------------
export * from '@reown/appkit-scaffold-ui';
// -- Hooks ------------------------------------------------------------
export * from '../src/library/vue/index.js';
// -- Utils & Other -----------------------------------------------------
export * from '../src/utils/index.js';
export { CoreHelperUtil, AccountController, NetworkController } from '@reown/appkit-core';
let modal = undefined;
export function createAppKit(options) {
    if (!modal) {
        modal = new AppKit({
            ...options,
            sdkVersion: CoreHelperUtil.generateSdkVersion(options.adapters ?? [], 'html', packageJson.version)
        });
        getAppKit(modal);
    }
    return modal;
}
export { AppKit };
// -- Hooks ------------------------------------------------------------
export * from '../src/library/vue/index.js';
//# sourceMappingURL=vue.js.map