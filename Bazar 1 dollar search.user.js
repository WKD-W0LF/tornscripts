

// ==UserScript==
// @name         Torn Bazaar - $1 Item Finder (tablet banner)
// @namespace    http://tampermonkey.net/
// @version      3.4
// @description  Clicks Torn's own "Cost" sort (cheapest first) so $1 items render at the top, then highlights them green/amber. Includes a tablet-friendly horizontal banner. No API key, no DOM reordering. Does not auto-buy.
// @author       Chris with UI enhancements by Leandria
// @license      MIT
// @match        https://www.torn.com/*
// @grant        none
// @run-at       document-idle
// @downloadURL  https://raw.githubusercontent.com/WKD-W0LF/tornscripts/main/Bazar%201%20dollar%20search.user.js
// @updateURL    https://raw.githubusercontent.com/WKD-W0LF/tornscripts/main/Bazar%201%20dollar%20search.user.js
// ==/UserScript==

(function () {
    'use strict';

    function onBazaar() {
        return location.href.includes('bazaar.php');
    }

    function parsePrice(text) {
        if (!text) return null;
        const cleaned = text.replace(/[^0-9.]/g, '');
        return cleaned === '' ? null : parseFloat(cleaned);
    }

    function getAllItems() {
        return Array.from(document.querySelectorAll('[data-testid="item"]'));
    }

    function getItemPrice(item) {
        const p = item.querySelector('[data-testid="price"]');
        return p ? parsePrice(p.textContent) : null;
    }

    function getItemName(item) {
        const n = item.querySelector('[data-testid="name"]');
        return n ? n.textContent.trim() : 'Unknown item';
    }

    function getItemStock(item) {
        const s = item.querySelector('[data-testid="amount-value"]');
        return s ? s.textContent.trim() : '?';
    }

    function isLocked(item) {
        return !!item.querySelector(
            '[class*="isBlockedForBuying"], [class*="lockContainer"]'
        );
    }

    // ─── Find the Cost sort button ───
    function getCostButton() {
        return Array.from(
            document.querySelectorAll(
                '[data-testid="search-bar"] button, button[data-testid="item-button"]'
            )
        ).find(
            (button) =>
                button.textContent.trim().toLowerCase() === 'cost'
        );
    }

    // Read prices of currently-rendered items in DOM order.
    function renderedPrices() {
        return getAllItems()
            .map(getItemPrice)
            .filter((price) => price != null);
    }

    // ─── Tablet-friendly horizontal banner ───
    function getBadge() {
        let badge = document.getElementById('dollar-finder-badge');

        if (!badge) {
            badge = document.createElement('div');
            badge.id = 'dollar-finder-badge';

            badge.style.cssText = [
                'position:fixed',
                'top:70px',
                'left:8px',
                'right:8px',
                'z-index:99999',
                'box-sizing:border-box',
                'background:rgba(27,27,27,.94)',
                'color:#fff',
                'padding:8px 10px',
                'border-radius:8px',
                'font:13px/1.3 Arial,sans-serif',
                'box-shadow:0 4px 16px rgba(0,0,0,.5)',
                'border:2px solid #4caf50',
                'max-height:110px',
                'overflow:hidden'
            ].join(';');

            document.body.appendChild(badge);
        }

        return badge;
    }

    function renderBadge() {
        const badge = getBadge();

        const dollarItems = getAllItems().filter(
            (item) => getItemPrice(item) === 1
        );

        const buyable = dollarItems.filter(
            (item) => !isLocked(item)
        );

        const locked = dollarItems.filter(
            (item) => isLocked(item)
        );

        if (dollarItems.length === 0) {
            badge.innerHTML = `
                <div style="
                    display:flex;
                    align-items:center;
                    gap:12px;
                    white-space:nowrap;
                    min-width:0;
                ">
                    <b style="
                        font-size:15px;
                        flex:0 0 auto;
                    ">
                        $1 Finder
                    </b>

                    <span style="
                        color:#aaa;
                        overflow:hidden;
                        text-overflow:ellipsis;
                    ">
                        No $1 items visible — sorted cheapest-first.
                    </span>
                </div>
            `;

            badge.style.borderColor = '#666';
            return;
        }

        let itemCards = '';

        buyable.forEach((item) => {
            const name = getItemName(item);
            const escapedName = name.replace(/"/g, '&quot;');

            itemCards += `
                <div
                    data-name="${escapedName}"
                    style="
                        cursor:pointer;
                        flex:0 0 auto;
                        padding:7px 10px;
                        border-radius:5px;
                        background:#2a2a2a;
                        white-space:nowrap;
                        min-width:max-content;
                        touch-action:manipulation;
                        user-select:none;
                    "
                >
                    🟢 ${name}

                    <span style="color:#888;">
                        (${getItemStock(item)} in stock)
                    </span>
                </div>
            `;
        });

        locked.forEach((item) => {
            const name = getItemName(item);
            const escapedName = name.replace(/"/g, '&quot;');

            itemCards += `
                <div
                    data-name="${escapedName}"
                    style="
                        cursor:pointer;
                        flex:0 0 auto;
                        padding:7px 10px;
                        border-radius:5px;
                        background:#241f17;
                        color:#cda;
                        white-space:nowrap;
                        min-width:max-content;
                        touch-action:manipulation;
                        user-select:none;
                    "
                >
                    🟠 ${name}

                    <span style="color:#888;">
                        (${getItemStock(item)} in stock)
                    </span>
                </div>
            `;
        });

        badge.innerHTML = `
            <div style="
                display:flex;
                align-items:center;
                gap:12px;
                width:100%;
                min-width:0;
            ">
                <div style="
                    flex:0 0 auto;
                    white-space:nowrap;
                    padding-right:12px;
                    border-right:1px solid #555;
                ">
                    <div style="
                        font-size:15px;
                        font-weight:bold;
                    ">
                        🔎You have found ${dollarItems.length} bargains
                    </div>

                    <div style="
                        color:#aaa;
                        margin-top:3px;
                    ">
                        🟢 ${buyable.length}
                        &nbsp;
                        🟠 ${locked.length}
                    </div>
                </div>

                <div style="
                    display:flex;
                    flex:1 1 auto;
                    min-width:0;
                    gap:6px;
                    overflow-x:auto;
                    overflow-y:hidden;
                    padding:2px 0 5px;
                    scrollbar-width:thin;
                    -webkit-overflow-scrolling:touch;
                ">
                    ${itemCards}
                </div>
            </div>
        `;

        badge.style.borderColor = buyable.length
            ? '#4caf50'
            : '#ff9800';

        badge.querySelectorAll('[data-name]').forEach(
            (itemCard) => {
                itemCard.addEventListener('click', () => {
                    const itemName =
                        itemCard.getAttribute('data-name');

                    const onPage = getAllItems().find(
                        (item) =>
                            getItemName(item) === itemName
                    );

                    if (onPage) {
                        onPage.scrollIntoView({
                            behavior: 'smooth',
                            block: 'center'
                        });

                        onPage.style.boxShadow =
                            '0 0 22px 6px #4caf50';

                        setTimeout(() => {
                            onPage.style.boxShadow = '';
                        }, 1500);
                    }
                });
            }
        );
    }

    // ─── On-page highlighting ───
    function highlightOnPage() {
        if (!onBazaar()) return;

        const items = getAllItems();

        items.forEach((item) => {
            item.style.outline = '';
            item.style.outlineOffset = '';
            item.style.boxShadow = '';
        });

        items.forEach((item) => {
            if (getItemPrice(item) !== 1) return;

            const colour = isLocked(item)
                ? '#ff9800'
                : '#4caf50';

            item.style.outline = `3px solid ${colour}`;
            item.style.outlineOffset = '-3px';
            item.style.boxShadow = `0 0 12px ${colour}`;
        });
    }

    // ─── Auto-sort logic ───
    const pause = (milliseconds) =>
        new Promise((resolve) =>
            setTimeout(resolve, milliseconds)
        );

    let sorting = false;
    let sortedFor = '';

    async function ensureCheapestFirst() {
        if (sorting) return;

        sorting = true;

        try {
            const button = getCostButton();

            if (!button) return;

            // Click Cost if it is not already the active sort.
            if (!button.className.includes('active___')) {
                button.click();
                await pause(500);
            }

            // Check whether the first rendered item is the cheapest.
            const prices = renderedPrices();

            if (prices.length >= 2) {
                const ascending =
                    prices[0] <= prices[prices.length - 1];

                if (!ascending) {
                    // Wrong direction — click again.
                    const secondButton = getCostButton();

                    if (secondButton) {
                        secondButton.click();
                        await pause(500);
                    }
                }
            }
        } finally {
            sorting = false;
            highlightOnPage();
            renderBadge();
        }
    }

    function tick() {
        if (!onBazaar()) {
            const badge = document.getElementById(
                'dollar-finder-badge'
            );

            if (badge) {
                badge.remove();
            }

            sortedFor = '';
            return;
        }

        if (
            location.href !== sortedFor &&
            getCostButton() &&
            getAllItems().length > 0
        ) {
            sortedFor = location.href;
            ensureCheapestFirst();
        }

        if (!sorting) {
            highlightOnPage();
            renderBadge();
        }
    }

    let timer = null;

    new MutationObserver(() => {
        if (sorting) return;

        clearTimeout(timer);
        timer = setTimeout(tick, 300);
    }).observe(document.body, {
        childList: true,
        subtree: true
    });

    setTimeout(tick, 1200);

    // Alt+R = manually re-sort if needed.
    window.addEventListener('keydown', (event) => {
        if (
            event.key.toLowerCase() === 'r' &&
            event.altKey &&
            onBazaar()
        ) {
            sortedFor = '';
            tick();
        }
    });
})();