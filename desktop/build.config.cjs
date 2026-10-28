/** Windows test distributions contain the compiled game and the Electron runtime. */
module.exports = {
  appId: 'nl.sjorswakka.drunkenjoyride',
  productName: 'Drunken Joyride',
  executableName: 'Drunken Joyride',
  directories: { output: 'release' },
  files: ['dist/**/*', 'desktop/main.cjs', 'package.json'],
  asar: true,
  compression: 'normal',
  artifactName: 'Drunken-Joyride-Windows-${arch}.${ext}',
  win: {
    target: [{ target: 'zip', arch: ['x64'] }],
    // Test builds do not have a publisher certificate. Avoid invoking signing tools.
    signAndEditExecutable: false,
  },
  publish: null,
};
