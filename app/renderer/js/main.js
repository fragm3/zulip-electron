'use strict';

require(__dirname + '/js/tray.js');
const {ipcRenderer} = require('electron');

const DomainUtil = require(__dirname + '/js/utils/domain-util.js');
const WebView = require(__dirname + '/js/components/webview.js');
const ServerTab = require(__dirname + '/js/components/server-tab.js');
const FunctionalTab = require(__dirname + '/js/components/functional-tab.js');
const ConfigUtil = require(__dirname + '/js/utils/config-util.js');

class ServerManagerView {
	constructor() {
		this.$addServerButton = document.getElementById('add-tab');
		this.$tabsContainer = document.getElementById('tabs-container');

		const $actionsContainer = document.getElementById('actions-container');
		this.$reloadButton = $actionsContainer.querySelector('#reload-action');
		this.$settingsButton = $actionsContainer.querySelector('#settings-action');
		this.$webviewsContainer = document.getElementById('webviews-container');

		this.$reloadTooltip = $actionsContainer.querySelector('#reload-tooltip');
		this.$settingsTooltip = $actionsContainer.querySelector('#setting-tooltip');
		this.$sidebar = document.getElementById('sidebar');

		this.activeTabIndex = -1;
		this.tabs = [];
		this.functionalTabs = {};
	}

	init() {
		this.initSidebar();
		this.initTabs();
		this.initActions();
		this.registerIpcs();
	}

	initSidebar() {
		const showSidebar = ConfigUtil.getConfigItem('show-sidebar', true);
		this.toggleSidebar(showSidebar);
	}

	initTabs() {
		const servers = DomainUtil.getDomains();
		if (servers.length > 0) {
			for (let i = 0; i < servers.length; i++) {
				this.initServer(servers[i], i);
			}
			this.activateTab(0);
		} else {
			this.openSettings('Servers');
		}

		ipcRenderer.send('local-shortcuts', true);
	}

	initServer(server, index) {
		this.tabs.push(new ServerTab({
			icon: server.icon,
			$root: this.$tabsContainer,
			onClick: this.activateTab.bind(this, index),
			index,
			webview: new WebView({
				$root: this.$webviewsContainer,
				index,
				url: server.url,
				name: server.alias,
				isActive: () => {
					return index === this.activeTabIndex;
				},
				onNetworkError: this.openNetworkTroubleshooting.bind(this),
				onTitleChange: this.updateBadge.bind(this),
				nodeIntegration: false,
				preload: true
			})
		}));
	}

	initActions() {
		this.$reloadButton.addEventListener('click', () => {
			this.tabs[this.activeTabIndex].webview.reload();
		});
		this.$addServerButton.addEventListener('click', () => {
			this.openSettings('Servers');
		});
		this.$settingsButton.addEventListener('click', () => {
			this.openSettings('General');
		});
		this.$reloadButton.addEventListener('mouseover', () => {
			this.$reloadTooltip.removeAttribute('style');
		});
		this.$reloadButton.addEventListener('mouseout', () => {
			this.$reloadTooltip.style.display = 'none';
		});
		this.$settingsButton.addEventListener('mouseover', () => {
			this.$settingsTooltip.removeAttribute('style');
		});
		this.$settingsButton.addEventListener('mouseout', () => {
			this.$settingsTooltip.style.display = 'none';
		});
	}

	openFunctionalTab(tabProps) {
		if (this.functionalTabs[tabProps.name] !== undefined) {
			this.activateTab(this.functionalTabs[tabProps.name]);
			return;
		}

		this.functionalTabs[tabProps.name] = this.tabs.length;

		this.tabs.push(new FunctionalTab({
			materialIcon: tabProps.materialIcon,
			$root: this.$tabsContainer,
			onClick: this.activateTab.bind(this, this.functionalTabs[tabProps.name]),
			onDestroy: this.destroyTab.bind(this, tabProps.name, this.functionalTabs[tabProps.name]),
			webview: new WebView({
				$root: this.$webviewsContainer,
				index: this.functionalTabs[tabProps.name],
				url: tabProps.url,
				name: tabProps.name,
				isActive: () => {
					return this.functionalTabs[tabProps.name] === this.activeTabIndex;
				},
				onNetworkError: this.openNetworkTroubleshooting.bind(this),
				onTitleChange: this.updateBadge.bind(this),
				nodeIntegration: true,
				preload: false
			})
		}));

		this.activateTab(this.functionalTabs[tabProps.name]);
	}

	openSettings(nav = 'General') {
		this.openFunctionalTab({
			name: 'Settings',
			materialIcon: 'settings',
			url: `file://${__dirname}/preference.html#${nav}`
		});
		this.tabs[this.functionalTabs.Settings].webview.send('switch-settings-nav', nav);
	}

	openAbout() {
		this.openFunctionalTab({
			name: 'About',
			materialIcon: 'sentiment_very_satisfied',
			url: `file://${__dirname}/about.html`
		});
	}

	openNetworkTroubleshooting() {
		this.openFunctionalTab({
			name: 'Network Troubleshooting',
			materialIcon: 'network_check',
			url: `file://${__dirname}/network.html`
		});
	}

	activateTab(index, hideOldTab = true) {
		if (this.tabs[index].loading) {
			return;
		}

		if (this.activeTabIndex !== -1) {
			if (this.activeTabIndex === index) {
				return;
			} else if (hideOldTab) {
				this.tabs[this.activeTabIndex].deactivate();
			}
		}

		this.activeTabIndex = index;
		this.tabs[index].activate();
	}

	destroyTab(name, index) {
		if (this.tabs[index].loading) {
			return;
		}

		this.tabs[index].destroy();

		delete this.tabs[index];
		delete this.functionalTabs[name];

		// Issue #188: If the functional tab was not focused, do not activate another tab.
		if (this.activeTabIndex === index) {
			this.activateTab(0, false);
		}
	}

	destroyView() {
		// Clear global variables
		this.activeTabIndex = -1;
		this.tabs = [];
		this.functionalTabs = {};

		// Clear DOM elements
		this.$tabsContainer.innerHTML = '';
		this.$webviewsContainer.innerHTML = '';

		// Destroy shortcuts
		ipcRenderer.send('local-shortcuts', false);
	}

	reloadView() {
		this.destroyView();
		this.initTabs();
	}

	updateBadge() {
		let messageCountAll = 0;
		for (let i = 0; i < this.tabs.length; i++) {
			if (this.tabs[i] && this.tabs[i].updateBadge) {
				const count = this.tabs[i].webview.badgeCount;
				messageCountAll += count;
				this.tabs[i].updateBadge(count);
			}
		}

		ipcRenderer.send('update-badge', messageCountAll);
	}

	toggleSidebar(show) {
		if (show) {
			this.$sidebar.classList.remove('hidden');
		} else {
			this.$sidebar.classList.add('hidden');
		}
	}

	registerIpcs() {
		const webviewListeners = {
			'webview-reload': 'reload',
			back: 'back',
			focus: 'focus',
			forward: 'forward',
			zoomIn: 'zoomIn',
			zoomOut: 'zoomOut',
			zoomActualSize: 'zoomActualSize',
			'log-out': 'logOut',
			shortcut: 'showShortcut',
			'tab-devtools': 'openDevTools'
		};

		for (const key in webviewListeners) {
			ipcRenderer.on(key, () => {
				const activeWebview = this.tabs[this.activeTabIndex].webview;
				if (activeWebview) {
					activeWebview[webviewListeners[key]]();
				}
			});
		}

		ipcRenderer.on('open-settings', (event, settingNav) => {
			this.openSettings(settingNav);
		});
		ipcRenderer.on('open-about', this.openAbout.bind(this));
		ipcRenderer.on('reload-viewer', this.reloadView.bind(this));
		ipcRenderer.on('hard-reload', () => {
			ipcRenderer.send('reload-full-app');
		});
		ipcRenderer.on('switch-server-tab', (event, index) => {
			this.activateTab(index);
		});
		ipcRenderer.on('toggle-sidebar', (event, show) => {
			this.toggleSidebar(show);
		});
		ipcRenderer.on('render-taskbar-icon', (event, messageCount) => {
			// Create a canvas from unread messagecounts
			function createOverlayIcon(messageCount) {
				const canvas = document.createElement('canvas');
				canvas.height = 128;
				canvas.width = 128;
				canvas.style.letterSpacing = '-5px';
				const ctx = canvas.getContext('2d');
				ctx.fillStyle = '#f42020';
				ctx.beginPath();
				ctx.ellipse(64, 64, 64, 64, 0, 0, 2 * Math.PI);
				ctx.fill();
				ctx.textAlign = 'center';
				ctx.fillStyle = 'white';
				if (messageCount > 99) {
					ctx.font = '65px Helvetica';
					ctx.fillText('99+', 64, 85);
				} else if (messageCount < 10) {
					ctx.font = '90px Helvetica';
					ctx.fillText(String(Math.min(99, messageCount)), 64, 96);
				} else {
					ctx.font = '85px Helvetica';
					ctx.fillText(String(Math.min(99, messageCount)), 64, 90);
				}
				return canvas;
			}
			ipcRenderer.send('update-taskbar-icon', createOverlayIcon(messageCount).toDataURL(), String(messageCount));
		});
	}
}

window.onload = () => {
	const serverManagerView = new ServerManagerView();
	serverManagerView.init();

	window.addEventListener('online', () => {
		serverManagerView.reloadView();
	});
};
