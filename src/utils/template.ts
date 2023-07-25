import {App, moment, normalizePath, Notice, TFile} from 'obsidian';
import {Link} from 'src/types';

const DEFAULT_TEMPLATE = `---
tags: bookmark
title: "{{title}}"
url: {{url}}
---

# {{title}}

url: {{url}}

{{note}}
`;

// This file is mostly from https://github.com/anpigon/obsidian-book-search-plugin/blob/master/src/utils/template.ts

export async function getTemplateContents(
  app: App,
  templatePath: string | undefined,
): Promise<string> {
  if (templatePath == null || templatePath === '') {
    return DEFAULT_TEMPLATE;
  }
  const {metadataCache, vault} = app;
  const normalizedTemplatePath = normalizePath(templatePath);

  try {
    const templateFile = metadataCache.getFirstLinkpathDest(
      normalizedTemplatePath,
      '',
    );
    return templateFile ? vault.cachedRead(templateFile) : DEFAULT_TEMPLATE;
  } catch (err) {
    console.error(`Failed to read template path: ${templatePath}`, err);
    new Notice('Failed to read template file LinkShelf');
    return DEFAULT_TEMPLATE;
  }
}

export function applyTemplateTransformations(
  rawTemplateContents: string,
): string {
  return rawTemplateContents.replace(
    /{{\s*(date|time)\s*(([+-]\d+)([yqmwdhs]))?\s*(:.+?)?}}/gi,
    (_, _timeOrDate, calc, timeDelta, unit, momentFormat) => {
      // @ts-ignore
      const now: moment.Moment = moment();
      const currentDate = now.clone().set({
        hour: now.hour(),
        minute: now.minute(),
        second: now.second(),
      });
      if (calc) {
        currentDate.add(parseInt(timeDelta, 10), unit);
      }

      if (momentFormat) {
        return currentDate.format(momentFormat.substring(1).trim());
      }
      return currentDate.format('YYYY-MM-DD');
    },
  );
}

export function replaceVariableSyntax(link: Link, text: string): string {
  if (!text?.trim()) {
    return '';
  }

  const entries = Object.entries(link);

  return entries
    .reduce((result, [key, val = '']) => {
      return result.replace(new RegExp(`{{${key}}}`, 'ig'), val);
    }, text)
    .replace(/{{\w+}}/gi, '')
    .trim();
}

export function executeInlineScriptsTemplates(link: Link, text: string) {
  const commandRegex = /<%(?:=)(.+)%>/g;
  const ctor = getFunctionConstructor();
  const matchedList = [...text.matchAll(commandRegex)];
  return matchedList.reduce((result, [matched, script]) => {
    try {
      const outputs = new ctor(
        [
          'const [link] = arguments',
          `const output = ${script}`,
          'if(typeof output === "string") return output',
          'return JSON.stringify(output)',
        ].join(';'),
      )(link);
      return result.replace(matched, outputs);
    } catch (err) {
      console.warn(err);
    }
    return result;
  }, text);
}

export function getFunctionConstructor(): typeof Function {
  try {
    return new Function('return (function(){}).constructor')();
  } catch (err) {
    console.warn(err);
    if (err instanceof SyntaxError) {
      throw Error('Bad template syntax');
    } else {
      throw err;
    }
  }
}

export async function useTemplaterPluginInFile(app: App, file: TFile) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const templater = (app as any).plugins.plugins['templater-obsidian'];
  if (templater && !templater?.settings['trigger_on_file_creation']) {
    await templater.templater.overwrite_file_commands(file);
  }
}
