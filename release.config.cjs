
module.exports = {
  branches: ['main', {
    "name": 'staging',
    "prerelease": 'beta'
  },{
    "name": 'develop',
    "prerelease": 'dev'
  }],
  plugins: [
    '@semantic-release/commit-analyzer',
    '@semantic-release/release-notes-generator',
    [
      '@semantic-release/npm',
      {
        npmPublish: false
      }
    ],
    '@semantic-release/changelog',
    [
      '@semantic-release/exec',
      {
        prepareCmd: 'npm run vscode:prepublish && npx vsce package --out clockit-${nextRelease.version}.vsix'
      }
    ],
    [
      '@semantic-release/git',  
      {
        "assets": ["package.json", "CHANGELOG.md"],
        "message": "chore(release): ${nextRelease.version} [skip ci]"
      }
    ],
    [
      '@semantic-release/github',
      {
        assets: [
          { path: 'dist/**/*', label: 'Distribution files' },
          { path: 'clockit-*.vsix', label: 'VSIX package' },
        ],
      },
    ],
  ]
};
