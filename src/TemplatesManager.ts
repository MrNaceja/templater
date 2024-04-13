import * as vscode from "vscode";
import fs from "node:fs";
import path from "node:path";
import { TTemplate, TTemplateModuleRender, TTemplateOptions } from "./types";
import Configuration from "./Configuration";

const TEMPLATE_EXTENSION = ".mjs";

export default class TemplatesManager {
  createFileTemplate(templateName: string) {
    if (this.existsTemplate(templateName)) {
      throw new Error(
        "The template name already exists, please choose other name."
      );
    }

    fs.writeFileSync(
      this.templatePath(templateName),
      this.getTemplateEstructure()
    );
    return this.templatePath(templateName);
  }

  async createNewFileBasedOnTemplate(
    template: TTemplate,
    newFileName: string,
    pathContext: string
  ) {
    if (this.existsTemplate(template.name)) {
      const newFileNameWithPath = path.join(pathContext, newFileName);
      if (fs.existsSync(pathContext)) {
        // Directory to create file exists?
        const templateOptions: TTemplateOptions = {
          currentDate: new Date(),
          filenameWithExtension: newFileName,
          filePath: pathContext,
          customOptions: Configuration.get("customOptions", {}),
          author: {
            name: Configuration.get("author.name"),
            email: Configuration.get("author.email"),
          },
        };

        const templateContent = await this.renderTemplateContent(
          template,
          templateOptions
        );
        fs.writeFileSync(newFileNameWithPath, templateContent);
        return newFileNameWithPath;
      }
      throw new Error("File existent!");
    }
    throw new Error("Inexistent template!");
  }

  private async renderTemplateContent(
    template: TTemplate,
    options: TTemplateOptions
  ): Promise<string> {
    let content = "";
    try {
      const templateModulePath = vscode.Uri.file(template.path).toString();
      const templateRender: TTemplateModuleRender = (
        await import(templateModulePath)
      ).default;
      try {
        content = templateRender(options);
      } catch (e) {
        throw new SyntaxError(
          "Your template has sintax errors: " + e!.toString()
        );
      }
    } catch (e) {
      let _error = "An error as ocurred rendering a template.";
      if (e instanceof SyntaxError) {
        _error = e.message;
      }
      throw new Error(_error);
    }
    return content;
  }

  /**
   * Returns the template estructure default as module exports.
   */
  private getTemplateEstructure() {
    if (this.existsTemplate("default")) {
      return fs.readFileSync(this.templatePath("default"), "utf8");
    }
    return `/**
 * @typedef  {Object       } TTemplateOptions
 * @property {Date         } currentDate
 * @property {string       } filenameWithExtension
 * @property {string       } filePath
 * @property {TOptionAuthor} author
 *
 * @typedef  {Object } TOptionAuthor
 * @property {string?} name
 * @property {string?} email
 *
 * @typedef {(TTemplateOptions) => string} TTemplateRender
 * @type {TTemplateRender} TTemplateRender
 */
export default (options) => \`
/**
 * This is a \${options.filenameWithExtension\} file created with template! :)
 * 
 * @author \${\`\${options.author.name\} - \${options.author.email\}\`\} 
 * @since \${options.currentDate.toLocaleDateString()}
 */
\`;
`;
  }

  /**
   * Verify if a template already exists.
   */
  public existsTemplate(templateName: string): boolean {
    return fs.existsSync(this.templatePath(templateName));
  }

  /**
   * Mount a template name with full path.
   * @example Example: .../templates/template.js
   */
  public templatePath = (templateName: string): string => {
    return path.join(this.templatesDir(), templateName + TEMPLATE_EXTENSION);
  };

  /**
   * Mount a template directory full path (verify if has a custom templates directory on configuration).
   * @example .../templates
   */
  public templatesDir(): string {
    let templatesDir = vscode.workspace
      .getConfiguration()
      .get("templatesDir", null);

    // Se existir um diretório de templates personalizado configurado utiliza este
    if (templatesDir) {
      if (!fs.existsSync(templatesDir)) {
        this.createTemplatesDir(templatesDir);
      }
      return templatesDir;
    }

    return path.join(__dirname, "templates");
  }

  /**
   * Create a templates directory.
   */
  private createTemplatesDir(templatesDirName: string) {
    try {
      if (!fs.existsSync(templatesDirName)) {
        fs.mkdirSync(templatesDirName);
      }
    } catch (e) {
      console.log(e);
      throw new Error(
        "A error ocurred when trying create a templates directory."
      );
    }
  }

  /**
   * Hook to use/get templates existents.
   */
  public useTemplates = (): Promise<Map<string, TTemplate>> => {
    return new Promise((resolve, reject) => {
      fs.readdir(this.templatesDir(), (error, filesTemplate) => {
        if (error) {
          return reject(error);
        }
        const templates: Map<string, TTemplate> = new Map();
        const templatesDir = this.templatesDir();
        filesTemplate.forEach((templateFile) => {
          let templateName = templateFile.split(".").at(0) as string;
          if (!templates.has(templateName)) {
            templates.set(templateName, {
              name: templateName,
              filename: templateFile,
              path: path.join(templatesDir, templateFile),
            });
          }
        });

        resolve(templates);
      });
    });
  };
}
