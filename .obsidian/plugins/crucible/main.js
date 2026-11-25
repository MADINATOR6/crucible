// Crucible for Obsidian: launches the open brief through ccx (scripts/crucible.ps1) and keeps the
// generated Status notes fresh. Desktop only. Launching never happens on edit or save: only these
// commands start work, and crucible.ps1 refuses a duplicate run of the same brief.
const { Plugin, Notice, Modal, Setting } = require('obsidian');
const { execFile } = require('child_process');
const path = require('path');

class NewBriefModal extends Modal {
  constructor(app, onSubmit) { super(app); this.onSubmit = onSubmit; this.title = ''; this.owner = 'auto'; }
  onOpen() {
    const { contentEl } = this;
    contentEl.createEl('h3', { text: 'New brief' });
    new Setting(contentEl).setName('Outcome (title)').addText((t) => t.onChange((v) => { this.title = v; }));
    new Setting(contentEl).setName('Owner').addDropdown((d) => d
      .addOptions({ auto: 'Automatic (ccx picks)', gemini: 'Gemini', claude: 'Claude', codex: 'Codex' })
      .setValue('auto').onChange((v) => { this.owner = v; }));
    new Setting(contentEl).addButton((b) => b.setButtonText('Create').setCta().onClick(() => {
      if (!this.title.trim()) { new Notice('Give the brief a title.'); return; }
      this.close(); this.onSubmit(this.title.trim(), this.owner);
    }));
  }
  onClose() { this.contentEl.empty(); }
}

module.exports = class CruciblePlugin extends Plugin {
  async onload() {
    this.busy = new Set();
    this.addRibbonIcon('rocket', 'Crucible: launch this brief', () => this.launch());
    this.addCommand({ id: 'launch-brief', name: 'Launch this brief', callback: () => this.launch() });
    this.addCommand({ id: 'stop-brief', name: 'Stop this brief\'s run', callback: () => this.stop() });
    this.addCommand({ id: 'new-brief', name: 'New brief', callback: () => new NewBriefModal(this.app, (t, o) => this.create(t, o)).open() });
    this.addCommand({ id: 'refresh-board', name: 'Refresh board', callback: () => this.run(['board'], 'Board refreshed.') });
    this.addCommand({ id: 'open-start-here', name: 'Open Start Here', callback: () => this.app.workspace.openLinkText('Start Here', '', false) });
    // Runs finish in the background and rewrite Status/; refresh the board when Obsidian opens.
    this.app.workspace.onLayoutReady(() => this.run(['board'], null));
  }

  script(args) {
    const root = this.app.vault.adapter.getBasePath();
    return new Promise((resolve) => {
      // crucible.ps1 starts the run itself (through WMI), so closing Obsidian never ends it.
      execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'scripts', 'crucible.ps1'), ...args],
        { cwd: root, windowsHide: true, timeout: 120000 },
        (error, stdout, stderr) => resolve({ code: error ? (error.code ?? 1) : 0, out: `${stdout}${stderr}`.trim() }));
    });
  }

  async run(args, okText) {
    const r = await this.script(args);
    if (r.code !== 0) new Notice(`Crucible: ${r.out || 'failed'}`, 10000);
    else if (okText) new Notice(okText);
    return r;
  }

  activeBrief() {
    const file = this.app.workspace.getActiveFile();
    if (!file || file.extension !== 'md') { new Notice('Open a brief first.'); return null; }
    return file;
  }

  async launch() {
    const file = this.activeBrief();
    if (!file) return;
    if (this.busy.has(file.path)) { new Notice('Already launching this brief.'); return; }
    this.busy.add(file.path);
    try {
      new Notice(`Launching ${file.basename}...`);
      const r = await this.script(['launch', '-Note', file.path]);
      new Notice(r.out || (r.code === 0 ? 'Launched.' : 'Launch failed.'), r.code === 0 ? 6000 : 12000);
    } finally { this.busy.delete(file.path); }
  }

  async stop() {
    const file = this.activeBrief();
    if (file) await this.run(['stop', '-Note', file.path], 'Stop requested.');
  }

  async create(title, owner) {
    const r = await this.script(['new', '-Title', title, '-Owner', owner]);
    if (r.code !== 0) { new Notice(`Crucible: ${r.out}`, 10000); return; }
    const rel = r.out.split(/\r?\n/).pop().trim();
    // The new file may not be indexed yet; openLinkText resolves it by path.
    setTimeout(() => this.app.workspace.openLinkText(rel, '', false), 300);
  }
};
