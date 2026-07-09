"use strict";

/**
 * Tabs module - renders and manages the project tab strip.
 * Calls existing global functions from projects.js to manage state.
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
