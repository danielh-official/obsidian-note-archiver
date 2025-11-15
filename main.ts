import {
	App,
	Menu,
	MenuItem,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	TAbstractFile,
	TFile,
} from "obsidian";

interface NoteArchiverSettings {
	archivePropertyName: string;
}

const DEFAULT_SETTINGS: NoteArchiverSettings = {
	archivePropertyName: "archived_at",
};

// Settings tab for the plugin
class NoteArchiverSettingTab extends PluginSettingTab {
	plugin: NoteArchiverPlugin;

	constructor(app: App, plugin: NoteArchiverPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl("h2", { text: "Note Archiver Settings" });

		new Setting(containerEl)
			.setName("Archive property name")
			.setDesc(
				"The name of the frontmatter property used to mark files as archived (must be a date type property)",
			)
			.addText((text) =>
				text
					.setPlaceholder("archived_at")
					.setValue(this.plugin.settings.archivePropertyName)
					.onChange(async (value) => {
						this.plugin.settings.archivePropertyName =
							value || "archived_at";
						await this.plugin.saveSettings();
						// Refresh file hiding after changing property name
						this.plugin.hideArchivedFiles();
					}),
			);
	}
}

// Main plugin class
export default class NoteArchiverPlugin extends Plugin {
	settings: NoteArchiverSettings;

	/**
	 * Archives a file by adding the archive property to its frontmatter.
	 * Should be date/time datatype.
	 * Only works if class method.
	 * @param file
	 */
	async archiveFile(file: TFile) {
		const today = new Date().toISOString();

		await this.app.fileManager.processFrontMatter(
			file,
			(frontmatter: { [x: string]: string }) => {
				frontmatter[this.settings.archivePropertyName] = today;
			},
		);

		new Notice(`File archived: ${file.basename}`);

		// Trigger hiding of archived files
		this.hideArchivedFiles();
	}

	/**
	 * Checks if a file is archived based on the archive property in frontmatter.
	 * @param file
	 * @returns
	 */
	isFileArchived(file: TFile): boolean {
		const cache = this.app.metadataCache.getFileCache(file);
		if (!cache?.frontmatter) {
			return false;
		}

		const archiveValue =
			cache.frontmatter[this.settings.archivePropertyName];
		// Check if the property exists and has a value (not null, undefined, or empty)
		return (
			archiveValue !== null &&
			archiveValue !== undefined &&
			archiveValue !== ""
		);
	}

	/**
	 * Hides archived files in the file explorer based on the archive property.
	 */
	hideArchivedFiles() {
		const fileExplorers =
			this.app.workspace.getLeavesOfType("file-explorer");

		fileExplorers.forEach((leaf) => {
			const fileExplorer = (leaf.view as any).fileItems;
			if (fileExplorer) {
				Object.keys(fileExplorer).forEach((path) => {
					const fileItem = fileExplorer[path];
					const file = this.app.vault.getAbstractFileByPath(path);

					if (file instanceof TFile && file.extension === "md") {
						const isArchived = this.isFileArchived(file);

						if (fileItem.selfEl) {
							if (isArchived) {
								fileItem.selfEl.style.display = "none";
							} else {
								fileItem.selfEl.style.display = "";
							}
						}
					}
				});
			}
		});
	}

	async onload() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData(),
		);

		// Add settings tab
		this.addSettingTab(new NoteArchiverSettingTab(this.app, this));

		// Register event to hide archived files in file explorer
		this.registerEvent(
			this.app.workspace.on("layout-change", () => {
				this.hideArchivedFiles();
			}),
		);

		// Register event to hide archived files when vault changes
		this.registerEvent(
			this.app.vault.on("modify", () => {
				this.hideArchivedFiles();
			}),
		);

		// Register event to hide archived files when metadata changes
		this.registerEvent(
			this.app.metadataCache.on("changed", () => {
				this.hideArchivedFiles();
			}),
		);

		// Add context menu item for file explorer (right-click)
		this.registerEvent(
			this.app.workspace.on(
				"file-menu",
				(menu: Menu, file: TAbstractFile) => {
					if (file instanceof TFile && file.extension === "md") {
						menu.addItem((item: MenuItem) => {
							// If file is already archived, show an "Unarchive" option instead
							if (this.isFileArchived(file)) {
								item.setTitle("Unarchive")
									.setIcon("archive")
									.onClick(async () => {
										await this.app.fileManager.processFrontMatter(
											file,
											(frontmatter) => {
												frontmatter[
													this.settings.archivePropertyName
												] = null;
											},
										);

										new Notice(
											`File unarchived: ${file.basename}`,
										);

										// Trigger hiding of archived files
										this.hideArchivedFiles();
									});
							} else {
								item.setTitle("Archive")
									.setIcon("archive")
									.onClick(async () => {
										await this.archiveFile(file);
									});
							}
						});
					}
				},
			),
		);

		// Add menu item to file view's three-dot menu
		this.registerEvent(
			this.app.workspace.on(
				"editor-menu",
				(menu: Menu, _editor, view) => {
					const file = view.file;
					if (file) {
						menu.addItem((item: MenuItem) => {
							item.setTitle("Archive")
								.setIcon("archive")
								.onClick(async () => {
									await this.archiveFile(file);
								});
						});
					}
				},
			),
		);

		// Hide archived files on initial load
		this.app.workspace.onLayoutReady(() => {
			this.hideArchivedFiles();
		});
	}

	onunload() {
		// Show all files again when plugin is unloaded
		const fileExplorers =
			this.app.workspace.getLeavesOfType("file-explorer");

		fileExplorers.forEach((leaf) => {
			const fileExplorer = (leaf.view as any).fileItems;
			if (fileExplorer) {
				Object.keys(fileExplorer).forEach((path) => {
					const fileItem = fileExplorer[path];
					if (fileItem.selfEl) {
						fileItem.selfEl.style.display = "";
					}
				});
			}
		});
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
