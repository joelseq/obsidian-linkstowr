import {
  App,
  normalizePath,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
} from 'obsidian';
import {Link} from './types';
import {getAPI} from './utils/api';
import {replaceIllegalFileNameCharactersInString} from './utils/file';
import {
  applyTemplateTransformations,
  executeInlineScriptsTemplates,
  getTemplateContents,
  replaceVariableSyntax,
  useTemplaterPluginInFile,
} from './utils/template';

interface PluginSettings {
  accessToken: string;
  linksFolderPath: string;
  templateFilePath: string;
  syncOnLoad: boolean;
}

const DEFAULT_SETTINGS: PluginSettings = {
  accessToken: '',
  linksFolderPath: 'links',
  templateFilePath: '',
  syncOnLoad: false,
};

export default class LinkShelfPlugin extends Plugin {
  settings: PluginSettings;

  async onload() {
    await this.loadSettings();

    // This creates an icon in the left ribbon.
    this.addRibbonIcon('dice', 'LinkShelf Sync', (_evt: MouseEvent) => {
      // Called when the user clicks the icon.
      // new Notice('This is a notice!');
      this.sync();
    });

    // This adds a simple command that can be triggered anywhere
    this.addCommand({
      id: 'sync-links',
      name: 'Sync links',
      callback: async () => {
        await this.sync();
      },
    });

    // This adds a settings tab so the user can configure various aspects of the plugin
    this.addSettingTab(new LinkShelfSettingTab(this.app, this));

    if (this.settings.syncOnLoad) {
      await this.sync();
    }

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
    try {
      const response = await api.get('/api/links');

      console.log('[LinkShelf] Got response: ', response);
      const links: Array<Link> | undefined = response.json;

      if (links) {
        const createdLinksPromises = links.map(async (link) => {
          const renderedContent = await this.getRenderedContent(link);

          const fileName = replaceIllegalFileNameCharactersInString(link.title);
          const filePath = this.getUniqueFilePath(fileName);
          try {
            const targetFile = await this.app.vault.create(
              filePath,
              renderedContent,
            );

            await useTemplaterPluginInFile(this.app, targetFile);
          } catch (err) {
            console.error(`Failed to create file: ${fileName}`, err);
            throw new Error('Failed when creating file');
          }
        });

        await Promise.all(createdLinksPromises);

        await api.post('/api/links/clear');

        new Notice('LinkShelf Sync successful!', 3000);
      }
    } catch (error) {
      new Notice('LinkShelf Sync failed', 3000);
    }
  }

  async getRenderedContent(link: Link) {
    const templateContents = await getTemplateContents(
      this.app,
      this.settings.templateFilePath,
    );
    const replacedVariable = replaceVariableSyntax(
      link,
      applyTemplateTransformations(templateContents),
    );
    return executeInlineScriptsTemplates(link, replacedVariable);
  }

  getUniqueFilePath(fileName: string): string {
    let dupeCount = 0;
    const folderPath = normalizePath(this.settings.linksFolderPath);
    let path = `${folderPath}/${fileName}.md`;

    // Handle duplicate file names by appending a count.
    while (this.app.vault.getAbstractFileByPath(path) != null) {
      dupeCount++;

      path = `${folderPath}/${fileName}-${dupeCount}.md`;
    }

    return path;
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

    new Setting(containerEl)
      .setName('Links folder path')
      .setDesc(
        'Path to the folder to save the links to (relative to your vault). Make sure the folder exists',
      )
      .addText((text) =>
        text
          .setPlaceholder('links')
          .setValue(this.plugin.settings.linksFolderPath)
          .onChange(async (value) => {
            this.plugin.settings.linksFolderPath = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Access Token')
      .setDesc('Enter your Access Token')
      .addText((text) =>
        text
          .setPlaceholder('lshelf_XXXXXX_XXXXXXXXXXX')
          .setValue(this.plugin.settings.accessToken)
          .onChange(async (value) => {
            this.plugin.settings.accessToken = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Template file path')
      .setDesc('Enter path to template file')
      .addText((text) =>
        text
          .setValue(this.plugin.settings.templateFilePath)
          .onChange(async (value) => {
            this.plugin.settings.templateFilePath = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Sync on load')
      .setDesc('Run the Sync command when Obsidian loads')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.syncOnLoad)
          .onChange(async (value) => {
            this.plugin.settings.syncOnLoad = value;
            await this.plugin.saveSettings();
          }),
      );
  }
}
