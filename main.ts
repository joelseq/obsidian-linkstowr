import axios from 'axios';
import {
  App,
  Editor,
  MarkdownView,
  Modal,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
} from 'obsidian';

// Remember to rename these classes and interfaces!

interface PluginSettings {
  clipsFilePath: string;
}

type Clip = {
  url: string;
  note: string | undefined;
};

const DEFAULT_SETTINGS: PluginSettings = {
  clipsFilePath: 'clips.md',
};

const INITIAL_TEXT = `
# OmniClipper Clips

| Link | Notes |
| ---- | ----- |
`;

export default class OmniClipperPlugin extends Plugin {
  settings: PluginSettings;

  async onload() {
    await this.loadSettings();

    // This creates an icon in the left ribbon.
    const ribbonIconEl = this.addRibbonIcon(
      'dice',
      'OmniClipper Sync',
      (evt: MouseEvent) => {
        // Called when the user clicks the icon.
        // new Notice('This is a notice!');
        this.sync();
      },
    );
    // Perform additional things with the ribbon
    ribbonIconEl.addClass('my-plugin-ribbon-class');

    // This adds a status bar item to the bottom of the app. Does not work on mobile apps.
    const statusBarItemEl = this.addStatusBarItem();
    statusBarItemEl.setText('Status Bar Text');

    // This adds a simple command that can be triggered anywhere
    this.addCommand({
      id: 'sync-clips',
      name: 'Sync clips (OmniClipper)',
      callback: async () => {
        await this.sync();
      },
    });
    // This adds an editor command that can perform some operation on the current editor instance
    this.addCommand({
      id: 'sample-editor-command',
      name: 'Sample editor command',
      editorCallback: (editor: Editor, view: MarkdownView) => {
        console.log(editor.getSelection());
        editor.replaceSelection('Sample Editor Command');
      },
    });
    // This adds a complex command that can check whether the current state of the app allows execution of the command
    this.addCommand({
      id: 'open-sample-modal-complex',
      name: 'Open sample modal (complex)',
      checkCallback: (checking: boolean) => {
        // Conditions to check
        const markdownView =
          this.app.workspace.getActiveViewOfType(MarkdownView);
        if (markdownView) {
          // If checking is true, we're simply "checking" if the command can be run.
          // If checking is false, then we want to actually perform the operation.
          if (!checking) {
            new SampleModal(this.app).open();
          }

          // This command will only show up in Command Palette when the check function returns true
          return true;
        }
      },
    });

    // This adds a settings tab so the user can configure various aspects of the plugin
    this.addSettingTab(new OmniClipperSettingTab(this.app, this));

    // If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
    // Using this function will automatically remove the event listener when this plugin is disabled.
    // this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
    // 	console.log('click', evt);
    // });

    // When registering intervals, this function will automatically clear the interval when the plugin is disabled.
    // this.registerInterval(window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000));
  }

  onunload() {
    // Perform unload tasks here
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async sync() {
    const response = await axios.get(`${process.env.API_URL}/api/clips`);

    console.log('[OmniClipper] Got response: ', response);
    const links: Array<Clip> | undefined = response.data?.links;

    if (links) {
      console.log('Got links', links);
      const file = (await this.getClipsFile()) as TFile;
      console.log('Got file', file);

      const textToAppend = links.map(({url, note}) => {
        console.log('Appending url and note', url, note);
        return `|${url}|${note}|`;
      });

      await this.app.vault.append(file, '\n' + textToAppend.join('\n'));

      await axios.post(`${process.env.API_URL}/api/clips/clear`);
    }
  }

  async getClipsFile() {
    const vault = this.app.vault;
    let file = vault.getAbstractFileByPath(this.settings.clipsFilePath);
    if (!file) {
      file = await vault.create(this.settings.clipsFilePath, INITIAL_TEXT);
    }
    return file;
  }
}

class SampleModal extends Modal {
  constructor(app: App) {
    super(app);
  }

  onOpen() {
    const {contentEl} = this;
    contentEl.setText('Woah!');
  }

  onClose() {
    const {contentEl} = this;
    contentEl.empty();
  }
}

class OmniClipperSettingTab extends PluginSettingTab {
  plugin: OmniClipperPlugin;

  constructor(app: App, plugin: OmniClipperPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const {containerEl} = this;

    containerEl.empty();

    containerEl.createEl('h2', {text: 'Settings for OmniClipper'});

    new Setting(containerEl)
      .setName('Clips File Path')
      .setDesc('Path to the file to save the clips to')
      .addText((text) =>
        text
          .setPlaceholder('Enter the path to the file to save your clips to')
          .setValue(this.plugin.settings.clipsFilePath)
          .onChange(async (value) => {
            console.log('Clips File Path: ' + value);
            this.plugin.settings.clipsFilePath = value;
            await this.plugin.saveSettings();
          }),
      );
  }
}
