import {App, normalizePath, Plugin, PluginSettingTab, Setting} from 'obsidian';
import {Clip} from './types';
import {getAPI} from './utils/api';
import {replaceIllegalFileNameCharactersInString} from './utils/file';
import {
  applyTemplateTransformations,
  executeInlineScriptsTemplates,
  getTemplateContents,
  replaceVariableSyntax,
  useTemplaterPluginInFile,
} from './utils/template';

// Remember to rename these classes and interfaces!

interface PluginSettings {
  accessToken: string;
  clipsFolderPath: string;
  templateFilePath: string;
}

const DEFAULT_SETTINGS: PluginSettings = {
  accessToken: '',
  clipsFolderPath: 'clips',
  templateFilePath: '',
};

// const INITIAL_TEXT = `
// # LinkShelf Clips
//
// | Link | Notes |
// | ---- | ----- |
// `;

export default class LinkShelfPlugin extends Plugin {
  settings: PluginSettings;

  async onload() {
    await this.loadSettings();

    // This creates an icon in the left ribbon.
    const ribbonIconEl = this.addRibbonIcon(
      'dice',
      'LinkShelf Sync',
      (_evt: MouseEvent) => {
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
      id: 'linkshelf-sync-links',
      name: 'Sync links (Link Shelf)',
      callback: async () => {
        await this.sync();
      },
    });

    // This adds a settings tab so the user can configure various aspects of the plugin
    this.addSettingTab(new LinkShelfSettingTab(this.app, this));

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
    const api = getAPI(this.settings.accessToken);
    const response = await api.get('/api/clips');

    console.log('[LinkShelf] Got response: ', response);
    const clips: Array<Clip> | undefined = response.data;

    if (clips) {
      console.log('Got clips', clips);
      const createdClipsPromises = clips.map(async (clip) => {
        const renderedContent = await this.getRenderedContent(clip);

        const fileName = replaceIllegalFileNameCharactersInString(clip.title);
        const filePath = `${normalizePath(
          this.settings.clipsFolderPath,
        )}/${fileName}.md`;
        try {
          const targetFile = await this.app.vault.create(
            filePath,
            renderedContent,
          );

          console.log('Target file:', targetFile);

          await useTemplaterPluginInFile(this.app, targetFile);
        } catch (err) {
          console.error(`Failed to create file: ${fileName}`, err);
        }
      });

      await Promise.all(createdClipsPromises);

      await api.post('/api/clips/clear');
    }
  }

  async getRenderedContent(clip: Clip) {
    const templateContents = await getTemplateContents(
      this.app,
      this.settings.templateFilePath,
    );
    const replacedVariable = replaceVariableSyntax(
      clip,
      applyTemplateTransformations(templateContents),
    );
    return executeInlineScriptsTemplates(clip, replacedVariable);
  }
}

class LinkShelfSettingTab extends PluginSettingTab {
  plugin: LinkShelfPlugin;

  constructor(app: App, plugin: LinkShelfPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const {containerEl} = this;

    containerEl.empty();

    containerEl.createEl('h2', {text: 'Settings for LinkShelf'});

    new Setting(containerEl)
      .setName('Clips Folder Path')
      .setDesc('Path to the folder to save the clips to')
      .addText((text) =>
        text
          .setPlaceholder(
            'Enter the path to the folder to save your clips to (relative to your vault)',
          )
          .setValue(this.plugin.settings.clipsFolderPath)
          .onChange(async (value) => {
            console.log('Clips Folder Path: ' + value);
            this.plugin.settings.clipsFolderPath = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Access Token')
      .setDesc('Enter your Access Token')
      .addText((text) =>
        text
          .setPlaceholder('oclip_XXXXXX_XXXXXXXXXXX')
          .setValue(this.plugin.settings.accessToken)
          .onChange(async (value) => {
            this.plugin.settings.accessToken = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Template File Path')
      .setDesc('Enter path to template file')
      .addText((text) =>
        text
          .setValue(this.plugin.settings.templateFilePath)
          .onChange(async (value) => {
            this.plugin.settings.templateFilePath = value;
            await this.plugin.saveSettings();
          }),
      );
  }
}
