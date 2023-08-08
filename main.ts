import {
	App,
	Modal,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	requestUrl,
} from "obsidian";
import { BrowserWindow } from "@electron/remote";

const client_id = "rz4MFhTD80QwBsi6bc";
const client_secret = "t)6H$+3+O+$5BtFRArG44sv*3$qvZ8z)";

interface TickTickPluginSettings {
	token: string;
}

const DEFAULT_SETTINGS: TickTickPluginSettings = {
	token: "",
};

export default class TickTickPlugin extends Plugin {
	settings: TickTickPluginSettings;

	async onload() {
		await this.loadSettings();

		// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
		const statusBarItemEl = this.addStatusBarItem();
		statusBarItemEl.setText("Status Bar Text");

		this.addCommand({
			id: "open-ticktick-oauth-modal",
			name: "Connect to TickTick",
			callback: () => {
				if (this.settings.token) {
					new Notice("Already sign in TickTick");
					return;
				}
				new OauthModal(this.app, this).open();
			},
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SettingTab(this.app, this));
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
		console.log(this.settings);
		this.requestGET("/open/v1/project").then((data) => {
			if (data) {
				const { json } = data;
				console.log(json);
			}
		});
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	requestGET = (url: string) => {
		console.log({
			Authorization: `Bearer ${this.settings.token}`,
		});
		return requestUrl({
			method: "GET",
			url: "https://api.ticktick.com" + url,
			headers: {
				Authorization: `Bearer ${this.settings.token}`,
			},
		}).catch((e) => {
			console.log(e);
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
			console.log(e);
		});
	};
}

class OauthModal extends Modal {
	plugin: TickTickPlugin;

	constructor(app: App, plugin: TickTickPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;
		new Setting(contentEl).setName(
			"This plugin need connect to your TickTick Account"
		);
		new Setting(contentEl).addButton((btn) =>
			btn
				.setButtonText("Sign in TickTick")
				.setCta()
				.onClick(() => {
					const callbackUrl = "http://localhost/callback";

					const window = new BrowserWindow({
						width: 600,
						height: 800,
						webPreferences: {
							nodeIntegration: false, // We recommend disabling nodeIntegration for security.
							contextIsolation: true, // We recommend enabling contextIsolation for security.
							// see https://github.com/electron/electron/blob/master/docs/tutorial/security.md
						},
					});
					const url = `https://ticktick.com/oauth/authorize?client_id=${client_id}&redirect_uri=${encodeURIComponent(
						callbackUrl
					)}&response_type=code`;

					window.loadURL(url);
					console.log({ url });
					const {
						session: { webRequest },
					} = window.webContents;

					const filter = {
						urls: ["http://localhost/callback*"],
					};

					webRequest.onBeforeRequest(filter, async ({ url }) => {
						const urlParams = new URL(url).searchParams;
						const code = urlParams.get("code");
						console.log(
							"user granted previleges to temp credentials (requestToken) " +
								url,
							{ code }
						);
						if (code) {
							const urlencoded = new URLSearchParams();
							urlencoded.append("client_id", client_id);
							urlencoded.append("client_secret", client_secret);
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
							console.log({ urlencoded }, urlencoded.toString());
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
									console.log(json);
									this.plugin.settings.token =
										json.access_token;
									console.log(this.plugin.settings);
									await this.plugin.saveSettings();
									window.close();
									this.close();
								})
								.catch((err) => {
									// error
									console.log(err);
									window.close();
									this.close();
								});
						} else {
							// error
							window.close();
							this.close();
						}
					});
				})
		);
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class SettingTab extends PluginSettingTab {
	plugin: TickTickPlugin;

	constructor(app: App, plugin: TickTickPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName("TickTick API token")
			.setDesc("")
			.addButton((btn) =>
				btn
					.setButtonText("Sign in TickTick")
					.setCta()
					.onClick(() => {
						new OauthModal(this.app, this.plugin).open();
					})
			);
	}
}
