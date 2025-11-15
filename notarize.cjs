const { notarize } = require('@electron/notarize');
require('dotenv').config();

exports.default = async function notarizing(context) {
    const { electronPlatformName, appOutDir } = context;

    if (electronPlatformName !== 'darwin') {
        return;
    }

    // Skip notarization if credentials are not provided
    if (!process.env.APPLE_ID || !process.env.APPLE_PASSWORD) {
        console.log('Skipping notarization: APPLE_ID or APPLE_PASSWORD not set');
        return;
    }

    const appName = context.packager.appInfo.productFilename;
    const appPath = `${appOutDir}/${appName}.app`;

    console.log(`Notarizing ${appPath}...`);

    try {
        await notarize({
            appBundleId: 'com.creativeland.capacitimer',
            appPath: appPath,
            appleId: process.env.APPLE_ID,
            appleIdPassword: process.env.APPLE_PASSWORD,
            teamId: '22SGVMMH49',
            tool: 'notarytool',
        });
        console.log('Notarization complete');
    } catch (error) {
        console.error('Notarization failed:', error);
        throw error;
    }
};
