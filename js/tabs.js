"use strict";

/**
 * Tabs module - renders and manages the project tab strip, plus the
 * "closed projects" popover (reopen an earlier project, or delete it
 * forever). Pure DOM rendering + event wiring; all state logic lives in
 * js/projects.js (PS_* functions).
 */

/**
 * Render the project tab strip.
 * Clears the container and rebuilds all tabs from current open slots.
 */
function Tabs_render() {
	var bar = document.getElementById('tabsBar');
	if (!bar) return;

	bar.innerHTML = '';

	var slots = PS_openSlots();
	var activeSlot = PS_activeSlot();

	// Render each open project tab
	slots.forEach(function(slot) {
		var tab = document.createElement('div');
		tab.className = 'ptab';
		if (slot === activeSlot) {
			tab.className += ' active';
		}
		tab.setAttribute('data-slot', slot);

		// Project name span
		var nameSpan = document.createElement('span');
		nameSpan.className = 'ptab-name';
		var projName = PS_projectName(slot);
		nameSpan.textContent = projName;
		nameSpan.title = projName;

		// Close button
		var closeBtn = document.createElement('button');
		closeBtn.className = 'ptab-x';
		closeBtn.textContent = '×';
		closeBtn.title = 'Zamknij';

		// Close button click handler
		closeBtn.addEventListener('click', function(e) {
			e.stopPropagation();
			PS_closeTab(slot);
		});

		// Tab click handler (switch to this tab)
		tab.addEventListener('click', function() {
			PS_switchTo(slot);
		});

		tab.appendChild(nameSpan);
		tab.appendChild(closeBtn);
		bar.appendChild(tab);
	});

	// Add "new project" button
	var addBtn = document.createElement('button');
	addBtn.className = 'ptab-add';
	addBtn.id = 'ptabAdd';
	addBtn.textContent = '+';
	addBtn.title = 'Nowy projekt';
	addBtn.addEventListener('click', function() {
		openTemplatePicker();
	});
	bar.appendChild(addBtn);

	// "Open a saved (closed) project" button — this is how you get back a
	// project you previously closed with ×, or delete it forever.
	var openBtn = document.createElement('button');
	openBtn.className = 'ptab-add';
	openBtn.id = 'ptabOpen';
	openBtn.textContent = '📂';
	openBtn.title = t('ptab.openSaved');
	openBtn.addEventListener('click', Tabs_togglePanel);
	bar.appendChild(openBtn);

	if (_ptabPanelOpen) Tabs_renderClosedPanel();
}

/**
 * Open the template picker to create a new project tab.
 * Entry point for native menu and other UI code.
 */
function Tabs_new() {
	if (typeof openTemplatePicker === 'function') {
		openTemplatePicker();
	}
}

/* ---------- panel "otwórz zapisany projekt" ---------- */
let _ptabPanelOpen = false;

function Tabs_togglePanel(e) {
	if (e) e.stopPropagation();
	_ptabPanelOpen = !_ptabPanelOpen;
	if (_ptabPanelOpen) Tabs_renderClosedPanel();
	else Tabs_closePanel();
}
function Tabs_closePanel() {
	_ptabPanelOpen = false;
	const panel = document.getElementById('ptabPanel');
	if (panel) panel.classList.remove('on');
}

function Tabs_renderClosedPanel() {
	let panel = document.getElementById('ptabPanel');
	if (!panel) {
		panel = document.createElement('div');
		panel.className = 'ptab-panel';
		panel.id = 'ptabPanel';
		panel.addEventListener('click', function (e) { e.stopPropagation(); });
		document.body.appendChild(panel);
	}
	panel.innerHTML = '';

	const closed = PS_closedProjects();
	if (!closed.length) {
		const empty = document.createElement('div');
		empty.className = 'ptab-panel-empty';
		empty.textContent = t('ptab.noClosed');
		panel.appendChild(empty);
	} else {
		closed.forEach(function (p) {
			const row = document.createElement('div');
			row.className = 'ptab-panel-row';

			const name = document.createElement('span');
			name.className = 'ptab-panel-name';
			name.textContent = p.name;
			name.title = p.name;
			name.addEventListener('click', function () {
				PS_reopenProject(p.slot);
				Tabs_closePanel();
			});

			const del = document.createElement('button');
			del.className = 'ptab-panel-del';
			del.textContent = '✕';
			del.title = t('ptab.delTitle');
			del.addEventListener('click', function (e) {
				e.stopPropagation();
				if (!confirm(t('ptab.delConfirm', { n: p.name }))) return;
				PS_deleteProject(p.slot);
				Tabs_renderClosedPanel();
			});

			row.appendChild(name);
			row.appendChild(del);
			panel.appendChild(row);
		});
	}

	const btn = document.getElementById('ptabOpen');
	if (btn) {
		const r = btn.getBoundingClientRect();
		panel.style.left = r.left + 'px';
		panel.style.top = (r.bottom + 4) + 'px';
	}
	panel.classList.add('on');
}

document.addEventListener('click', function () { if (_ptabPanelOpen) Tabs_closePanel(); });
