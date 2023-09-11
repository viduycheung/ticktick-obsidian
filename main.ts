import {
	App,
	Modal,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	requestUrl,
	DropdownComponent,
	ButtonComponent,
	TextComponent,
	TextAreaComponent,
	TFile,
} from "obsidian";
import { BrowserWindow } from "@electron/remote";

const client_id = "rz4MFhTD80QwBsi6bc";
const client_secret = "t)6H$+3+O+$5BtFRArG44sv*3$qvZ8z)";

type Project = {
	id: string;
	name: string;
	sortOrder: number;
	isClosed: boolean;
};

type Task = {
	title: string;
	content: string;
	priority: number;
	//  0 | 1 | 3 | 5
	projectId: string;
};

interface TickTickPluginSettings {
	token: string;
	projects: Project[];
	avatarUrl: "";
	name: "";
	autoFetchData: boolean;
}

const DEFAULT_SETTINGS: TickTickPluginSettings = {
	token: "",
	projects: [],
	avatarUrl: "",
	name: "",
	autoFetchData: true,
};

export default class TickTickPlugin extends Plugin {
	settings: TickTickPluginSettings;

	async onload() {
		await this.loadSettings();

		this.addCommand({
			id: "create-task",
			name: "New task",
			callback: () => {
				if (this.checkUserLoginStatus()) {
					const title = (() => {
						const activeFile =
							this.app.workspace.activeEditor?.file;
						const sel =
							this.app.workspace.activeEditor?.editor?.getSelection();
						if (activeFile) {
							return `[${
								sel || activeFile.name
							}](${this.getFileLink(activeFile)})`;
						}
						return "";
					})();
					new CreateTaskModal(this.app, this, { title }).open();
				}
			},
		});

		this.addCommand({
			id: "fetch-data",
			name: "Fetch data",
			callback: async () => {
				if (this.checkUserLoginStatus()) {
					await this.fetchUserData();
					new Notice("Data fetched successfully");
				}
			},
		});

		this.addSettingTab(new SettingTab(this.app, this));

		this.registerAutoDataFetch();
	}

	onunload() {}

	registerAutoDataFetch = () => {
		if (this.settings.autoFetchData) {
			this.registerInterval(
				window.setInterval(() => {
					this.fetchUserData();
				}, 5 * 60 * 1000)
			);
		} else {
			this.fetchUserData();
		}
	};

	getFileLink = (file: TFile) => {
		return `obsidian://open?vault=${file.vault.getName()}&file=${encodeURIComponent(
			file.name
		)}`;
	};

	checkUserLoginStatus = () => {
		const isLogin = this.settings.token;
		if (!isLogin) {
			new Notice("TickTick is not logged in");
		}
		return isLogin;
	};

	logout = () => {
		this.settings.token = "";
		this.settings.projects = [];
		this.settings.avatarUrl = "";
		this.settings.name = "";
		this.saveSettings();
	};

	fetchProjects = async () => {
		try {
			const data = await this.requestGET("/open/v1/project");
			if (data) {
				const { json } = data;
				if (Array.isArray(json)) {
					this.settings.projects = json;
					this.saveSettings();
				}
			}
			return new Promise((resolve, reject) => resolve("ok"));
		} catch (error) {
			return new Promise((resolve, reject) => reject(error));
		}
	};

	fetchUserInfo = async () => {
		try {
			const data = await this.requestGET("/open/v1/user/info");
			if (data) {
				const { json } = data;
				this.settings.avatarUrl = json.avatarUrl;
				this.settings.name = json.name;
				this.saveSettings();
			}
			return new Promise((resolve, reject) => resolve("ok"));
		} catch (error) {
			return new Promise((resolve, reject) => reject(error));
		}
	};

	createTask = async (taskData: Task) => {
		try {
			const data = await this.requestPOST("/open/v1/task", taskData);
			if (data) {
				new Notice(`Add ${taskData.title}`);
			}
		} catch (error) {
			new Notice("Add Failed");
			return new Promise((resolve, reject) => reject(error));
		}
	};

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
		this.fetchUserData();
	}

	fetchUserData = async () => {
		if (this.settings.token) {
			return Promise.all([this.fetchUserInfo(), this.fetchProjects()]);
		}
		return new Promise((resolve, reject) => resolve("ok"));
	};

	async saveSettings() {
		await this.saveData(this.settings);
	}

	requestGET = (url: string) => {
		return requestUrl({
			method: "GET",
			url: "https://api.ticktick.com" + url,
			headers: {
				Authorization: `Bearer ${this.settings.token}`,
			},
		}).catch((e) => {
			switch (e.status) {
				case 401: {
					new Notice(
						"Your TickTick login credentials have expired. Please login again."
					);
					this.logout();
					break;
				}
				default:
					break;
			}
		});
	};

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	requestPOST = (url: string, body: Record<string, any>) => {
		return requestUrl({
			method: "POST",
			url: "https://api.ticktick.com" + url,
			headers: {
				Authorization: `Bearer ${this.settings.token}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(body),
		}).catch((e) => {
			switch (e.status) {
				case 401: {
					new Notice(
						"Your TickTick login credentials have expired. Please login again."
					);
					this.logout();
					break;
				}
				default:
					break;
			}
		});
	};
}

class CreateTaskModal extends Modal {
	plugin: TickTickPlugin;

	taskData: Task;

	constructor(app: App, plugin: TickTickPlugin, taskData: Partial<Task>) {
		super(app);
		this.plugin = plugin;
		const { title, content, priority, projectId } = taskData;
		this.taskData = {
			title: title || "",
			content: content || "",
			priority: priority == null ? 0 : priority,
			projectId: projectId || "inbox",
		};
	}

	onOpen() {
		const { contentEl, titleEl } = this;
		titleEl.setText("New Task");

		// title
		const titleComp = new TextComponent(
			contentEl.createDiv({ cls: "modal-line" })
		)
			.setPlaceholder("Title")
			.setValue(this.taskData.title)
			.onChange((value) => {
				this.taskData.title = value;
			});
		titleComp.inputEl.style.flex = "auto";

		// content
		const contentComp = new TextAreaComponent(
			contentEl.createDiv({ cls: "modal-line" })
		)
			.setPlaceholder("Content")
			.setValue(this.taskData.content)
			.onChange((value) => {
				this.taskData.content = value;
			});
		contentComp.inputEl.style.flex = "auto";

		// list
		const projectLine = contentEl.createDiv({ cls: "modal-line" });
		projectLine.createEl("div", { cls: "label", text: "List" });
		const projectComp = new DropdownComponent(projectLine)
			.addOptions(
				this.plugin.settings.projects.reduce(
					(id2Name: Record<string, string>, project) => {
						id2Name[project.id] = project.name;
						return id2Name;
					},
					{ inbox: "Inbox" }
				)
			)
			.setValue(this.taskData.projectId)
			.onChange((value) => {
				this.taskData.priority = +value;
			});
		projectComp.selectEl.style.flex = "auto";

		// priority
		const priorityLine = contentEl.createDiv({ cls: "modal-line" });
		priorityLine.createEl("div", { cls: "label", text: "Priority" });
		const priorityComp = new DropdownComponent(priorityLine)
			.addOptions({
				0: "None",
				1: "Low",
				3: "Medium",
				5: "High",
			})
			.setValue(this.taskData.priority.toString())
			.onChange((value) => {
				this.taskData.priority = +value;
			});
		priorityComp.selectEl.style.flex = "auto";

		// submit
		const submitComp = new ButtonComponent(contentEl)
			.setButtonText("Create")
			.setCta()
			.onClick(() => {
				if (this.taskData.title) {
					this.plugin.createTask(this.taskData);
					this.close();
				} else {
					new Notice("Task title can't be empty");
				}
			});
		submitComp.buttonEl.style.float = "right";
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class SettingTab extends PluginSettingTab {
	plugin: TickTickPlugin;

	window: Electron.CrossProcessExports.BrowserWindow | null;

	constructor(app: App, plugin: TickTickPlugin) {
		super(app, plugin);
		this.plugin = plugin;
		this.window = null;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		const isLogin = !!this.plugin.settings.token;

		if (isLogin) {
			new Setting(containerEl)
				.setName(this.plugin.settings.name)
				.setDesc("")
				.addButton((btn) =>
					btn.setButtonText("Logout").onClick(() => {
						this.plugin.logout();
						this.display();
					})
				);
		} else {
			new Setting(containerEl)
				.setName("Login with TickTick")
				.setDesc("")
				.addButton((btn) =>
					btn.setButtonText("Login").onClick(() => {
						const callbackUrl = "http://localhost/callback";

						if (this.window) {
							this.window.show();
							return;
						}

						const window = new BrowserWindow({
							width: 600,
							height: 800,
							webPreferences: {
								nodeIntegration: false, // We recommend disabling nodeIntegration for security.
								contextIsolation: true, // We recommend enabling contextIsolation for security.
								// see https://github.com/electron/electron/blob/master/docs/tutorial/security.md
							},
						});
						this.window = window;

						const close = () => {
							window.close();
							setTimeout(() => {
								this.display();
							});
						};

						const url = `https://ticktick.com/oauth/authorize?client_id=${client_id}&redirect_uri=${encodeURIComponent(
							callbackUrl
						)}&response_type=code`;

						window.loadURL(url);
						const {
							session: { webRequest },
						} = window.webContents;

						const filter = {
							urls: ["http://localhost/callback*"],
						};

						webRequest.onBeforeRequest(filter, async ({ url }) => {
							const urlParams = new URL(url).searchParams;
							const code = urlParams.get("code");
							if (code) {
								const urlencoded = new URLSearchParams();
								urlencoded.append("client_id", client_id);
								urlencoded.append(
									"client_secret",
									client_secret
								);
								urlencoded.append("code", code);
								urlencoded.append(
									"grant_type",
									"authorization_code"
								);
								urlencoded.append(
									"scope",
									"tasks:write tasks:read"
								);
								urlencoded.append("redirect_uri", callbackUrl);
								requestUrl({
									method: "POST",
									url: "https://ticktick.com/oauth/token",
									headers: {
										"Content-Type":
											"application/x-www-form-urlencoded",
									},
									body: urlencoded.toString(),
								})
									.then(async ({ json }) => {
										this.plugin.settings.token =
											json.access_token;
										await this.plugin.saveSettings();
										await this.plugin.fetchUserData();
										close();
									})
									.catch((err) => {
										// error
										new Notice("Login Failed");
										close();
									});
							} else {
								// cancel
								close();
							}
						});

						window.addListener("closed", () => {
							this.window = null;
						});
					})
				);
		}

		new Setting(containerEl)
			.setName("Fetch data background")
			.setDesc(
				"Automatically fetches your project data in the background to ensure you have the latest data when creating a task"
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.autoFetchData)
					.onChange(async (value) => {
						this.plugin.settings.autoFetchData = value;
						await this.plugin.saveSettings();
						new Notice(
							"Please restart Obsidian to let settings effect"
						);
					})
			);

		// new Setting(containerEl)
		// 	.setName("Clear Local Data")
		// 	.addButton((button) =>
		// 		button.setButtonText("Clear").onClick(() => {
		// 			this.plugin.settings = Object.assign({}, DEFAULT_SETTINGS);
		// 			this.plugin.saveSettings();
		// 			this.display();
		// 		})
		// 	);
	}
}
