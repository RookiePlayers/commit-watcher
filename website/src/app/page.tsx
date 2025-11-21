/* eslint-disable @next/next/no-img-element */
import Image from "next/image";
import Link from "next/link";

export default function Home() {
  return (
    <main>
      <nav className="navbar">
        <div className="container nav-container">
          <Link href="#" className="logo">
            <Image src="/assets/icon.png" alt="Commit Watcher Logo" width={32} height={32} />
            <span>Commit Watcher</span>
          </Link>
          <div className="nav-links">
            <Link href="#features">Features</Link>
            <Link href="#how-to-use">How to Use</Link>
            <Link href="#configuration">Configuration</Link>
            <a href="https://marketplace.visualstudio.com/items?itemName=octech.commit-watcher" className="btn btn-primary" target="_blank" rel="noopener noreferrer">Install Extension</a>
          </div>
        </div>
      </nav>

      <header className="hero">
        <div className="container hero-container">
          <div className="hero-content">
            <h1>Stop Over-Committing. Start Partitioning.</h1>
            <p className="hero-subtitle">Keep your commits small, focused, and intentional. Visualize your changes and partition them into bite-sized pieces directly in VS Code.</p>
            <div className="hero-actions">
              <a href="https://marketplace.visualstudio.com/items?itemName=octech.commit-watcher" className="btn btn-primary btn-lg" target="_blank" rel="noopener noreferrer">
                Install for VS Code
              </a>
              <a href="https://github.com/RookiePlayers/commit-watcher" className="btn btn-secondary btn-lg" target="_blank" rel="noopener noreferrer">
                View on GitHub
              </a>
            </div>
            <div className="badges">
              <img src="https://img.shields.io/visual-studio-marketplace/v/octech.commit-watcher?label=Version&style=flat-square&color=007acc" alt="Version" />
              <img src="https://img.shields.io/visual-studio-marketplace/d/octech.commit-watcher?label=Downloads&style=flat-square&color=2da44e" alt="Downloads" />
              <img src="https://img.shields.io/github/stars/RookiePlayers/commit-watcher?style=flat-square&logo=github" alt="Stars" />
            </div>
          </div>
          <div className="hero-image">
            <div className="browser-mockup">
              <div className="browser-header">
                <span className="dot red"></span>
                <span className="dot yellow"></span>
                <span className="dot green"></span>
              </div>
              <img src="https://github.com/user-attachments/assets/ece478e4-16de-4fd8-951e-3b8611b2f6f2" alt="Commit Watcher Demo" className="screenshot" />
            </div>
          </div>
        </div>
      </header>

      <section id="features" className="features">
        <div className="container">
          <h2 className="section-title">Why Commit Watcher?</h2>
          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon">📊</div>
              <h3>Status Bar Meter</h3>
              <p>Visual feedback on your changed files and lines versus your set limits. Choose between progress bars, text counts, or both.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">📦</div>
              <h3>Commit Buckets</h3>
              <p>Organize changes into buckets. Select files to include, inspect diffs, and &quot;Select up to N&quot; to quickly grab a manageable chunk.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">🤖</div>
              <h3>AI Commit Messages</h3>
              <p>Let AI write your commit messages. Uses GitHub Copilot to generate context-aware messages for your selected bucket.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">🚀</div>
              <h3>One-Click Push</h3>
              <p>Stage, commit, and push your selected bucket in a single click. Automatically sets upstream on the first push.</p>
            </div>
          </div>
        </div>
      </section>

      <section id="how-to-use" className="how-to-use">
        <div className="container">
          <h2 className="section-title">How It Works</h2>
          <div className="steps">
            <div className="step">
              <div className="step-number">1</div>
              <div className="step-content">
                <h3>Open Commit Buckets</h3>
                <p>Navigate to the Source Control sidebar and select <strong>Commit Buckets</strong>, or simply click the status bar entry.</p>
              </div>
            </div>
            <div className="step">
              <div className="step-number">2</div>
              <div className="step-content">
                <h3>Select Your Changes</h3>
                <p>Manually select files or use the <strong>Select up to N</strong> feature to automatically group changes.</p>
              </div>
            </div>
            <div className="step">
              <div className="step-number">3</div>
              <div className="step-content">
                <h3>Commit & Push</h3>
                <p>Generate a message with AI (optional), then click <strong>Commit bucket</strong> to ship it.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="configuration" className="configuration">
        <div className="container">
          <h2 className="section-title">Configuration</h2>
          <p className="section-subtitle">Customize Commit Watcher to fit your workflow in VS Code settings.</p>
          <div className="config-table-wrapper">
            <table className="config-table">
              <thead>
                <tr>
                  <th>Setting</th>
                  <th>Default</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><code>commitWatcher.maxFiles</code></td>
                  <td><code>10</code></td>
                  <td>Maximum number of changed files before warning.</td>
                </tr>
                <tr>
                  <td><code>commitWatcher.maxLines</code></td>
                  <td><code>1000</code></td>
                  <td>Maximum number of changed lines (add+del) before warning.</td>
                </tr>
                <tr>
                  <td><code>commitWatcher.warnRatio</code></td>
                  <td><code>0.7</code></td>
                  <td>Threshold ratio to switch status to yellow (0.7 = 70%).</td>
                </tr>
                <tr>
                  <td><code>commitWatcher.autoCheckOnSave</code></td>
                  <td><code>true</code></td>
                  <td>Automatically refresh counts after saving a file.</td>
                </tr>
                <tr>
                  <td><code>commitWatcher.statusBarType</code></td>
                  <td><code>progress</code></td>
                  <td>Display mode: &apos;text&apos;, &apos;progress&apos;, or &apos;both&apos;.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section id="husky" className="husky-integration">
        <div className="container">
          <h2 className="section-title">Integrate with Husky</h2>
          <p className="section-subtitle" style={{textAlign: 'center', color: 'var(--text-secondary)', maxWidth: '800px', margin: '0 auto 2rem'}}>
            Enforce commit limits automatically using our companion package <a href="https://www.npmjs.com/package/commit-bloat-watcher" target="_blank" rel="noopener noreferrer" style={{color: 'var(--accent-color)'}}>commit-bloat-watcher</a>.
          </p>
          <div style={{maxWidth: '800px', margin: '0 auto'}}>
            <p style={{marginBottom: '1rem', color: 'var(--text-secondary)'}}>
              Add a guard in your <code>.husky/pre-commit</code> file:
            </p>
            <div className="code-block">
              <pre>
{`#!/usr/bin/env sh
. "$(dirname "$0")/_/husky.sh"
npx commit-bloat-watcher --maxFiles 12 --maxLines 800 --quiet`}
              </pre>
            </div>
          </div>
        </div>
      </section>

      <footer className="footer">
        <div className="container footer-container">
          <div className="footer-left">
            <p>&copy; 2025 Commit Watcher. Released under the MIT License.</p>
          </div>
          <div className="footer-right">
            <a href="https://github.com/RookiePlayers/commit-watcher" target="_blank" rel="noopener noreferrer">GitHub</a>
            <a href="https://marketplace.visualstudio.com/items?itemName=octech.commit-watcher" target="_blank" rel="noopener noreferrer">Marketplace</a>
            <a href="https://github.com/RookiePlayers/commit-watcher/issues" target="_blank" rel="noopener noreferrer">Report Issue</a>
          </div>
        </div>
      </footer>
    </main>
  );
}
