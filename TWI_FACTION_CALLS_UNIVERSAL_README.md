# TWI Faction Calls - Universal Edition (v1.0.7)

## Overview
A fully responsive userscript for TWI Faction Calls that works seamlessly across **all devices**: Android phones (TornPDA), tablets (iPad), and desktop browsers. This universal version combines mobile optimizations with enhanced layouts for larger screens.

**Version:** 1.0.7 (Universal)  
**Original Authors:** Leandria & Wolf  
**Universal Optimization:** Bob  
**Faction:** Twilight - Reborn [56966]

## Key Features

### ✅ Universal Compatibility
- **Mobile Phones** (≤900px): Optimized for TornPDA on Android
- **Tablets** (901-1400px): Enhanced layout for iPad and similar devices
- **Desktop** (≥1401px): Full-featured experience on large screens

### ✅ Fixed for All Platforms
- Custom HTML dialogs replace native `prompt()`, `alert()`, and `confirm()`
- Works in TornPDA WebView, mobile browsers, and desktop browsers
- Touch-friendly interface with proper tap target sizes (44x44px minimum)

### ✅ Responsive Design
- Automatically adapts to screen size
- Optimized button sizes and spacing for each device type
- Smooth transitions between breakpoints

## Device-Specific Optimizations

### Mobile Phones (≤900px)
- **Layout**: Vertical stacking for narrow screens
- **Buttons**: 44x44px minimum for easy tapping
- **Status Chip**: Positioned to avoid TornPDA UI conflicts
- **Font Sizes**: Larger for readability on small screens

### Tablets (901-1400px)
- **Layout**: Balanced horizontal arrangement
- **Buttons**: 32x32px for comfortable touch
- **Spacing**: Optimized for medium-sized screens
- **Font Sizes**: Medium sizing for clarity

### Desktop (≥1401px)
- **Layout**: Compact horizontal layout
- **Buttons**: 30x30px for mouse precision
- **Spacing**: Efficient use of screen real estate
- **Font Sizes**: Standard sizing for desktop viewing

## Installation

### For TornPDA (Android)
1. Install TornPDA from Google Play Store
2. Enable userscripts in TornPDA settings
3. Copy `TWI_Faction_Calls_v1.0.7_Universal.user.js` to TornPDA's userscript directory
4. Restart TornPDA

### For Desktop Browsers
1. Install a userscript manager:
   - **Chrome/Edge**: Tampermonkey or Violentmonkey
   - **Firefox**: Tampermonkey or Greasemonkey
   - **Safari**: Userscripts
2. Click on the userscript manager icon
3. Select "Create new script" or "Install from file"
4. Paste the contents of `TWI_Faction_Calls_v1.0.7_Universal.user.js`
5. Save and enable the script

### For iPad/Tablet Browsers
1. Install a userscript-compatible browser:
   - **Safari**: Use Userscripts extension
   - **Chrome/Firefox**: Install Tampermonkey
2. Follow desktop installation steps above
3. The script will automatically detect tablet screen size

## First-Time Setup

1. Navigate to Torn's faction war page: `https://www.torn.com/factions.php#/war/`
2. A dialog will appear requesting your API key
3. Enter your **16-character Torn Public API key** named "Target Caller"
4. The key is stored locally and used only for faction verification

### Creating an API Key
1. Visit https://www.torn.com/preferences.php#tab=api
2. Create a new **Public** API key
3. Name it "Target Caller"
4. Copy the 16-character key
5. Paste into the script's dialog

## Usage Guide

### Status Chip
Located in the bottom-right corner:
- **Green "TWI Calls ✓"**: Connected to server
- **Red "TWI Calls !"**: Disconnected or error
- **Tap/Click**: View detailed connection status

### Making Target Calls

#### Available Target (Green Button)
- Shows "CALL" with green indicator
- Tap/click to claim the target
- Your call is shared with all faction members

#### Active Call (Red Timer)
- Shows countdown timer (e.g., "5:30")
- Displays caller's name below button
- **Your call**: Tap to release early
- **Others' call**: Read-only, cannot release

### Priority & Assist Flags

#### Star Icon (Priority)
- Marks high-priority targets
- Adds yellow highlight to target row
- Only caller can toggle

#### Speaker Icon (Assist Request)
- Requests backup from faction
- Adds orange outline to target row
- Only caller can toggle

### Auto-Clear Feature
- Calls automatically clear when targets are hospitalized or jailed
- No manual cleanup required
- Prevents wasted effort on unavailable targets

## Responsive Breakpoints

The script uses three responsive breakpoints:

```css
Mobile:  max-width: 900px
Tablet:  901px - 1400px
Desktop: min-width: 1401px
```

### Why These Breakpoints?

- **900px**: Separates phones from tablets (most phones are <900px in landscape)
- **1400px**: Separates tablets from desktop monitors (iPad Pro is ~1366px)
- Ensures optimal layout for each device category

## Menu Commands

Access from your userscript manager menu:

1. **Set Target Caller API Key**: Change or update your API key
2. **Connection Status**: View detailed connection information
3. **Forget API Key**: Remove saved credentials and session

## Troubleshooting

### API Key Dialog Not Appearing
✅ **FIXED** in v1.0.7 - Uses custom HTML dialogs that work everywhere

### Script Not Loading
- Verify userscript manager is installed and enabled
- Check that the script is enabled in the manager
- Refresh the page (Ctrl+F5 or Cmd+Shift+R)
- Check browser console for errors (F12)

### Connection Issues
- Tap/click status chip for detailed info
- Verify API key is exactly 16 characters
- Ensure you're a member of Twilight - Reborn [56966]
- Check internet connection

### Layout Issues on Specific Device
- Clear browser cache
- Check which breakpoint is active (use browser dev tools)
- Ensure browser zoom is at 100%
- Try rotating device (portrait/landscape)

### Buttons Too Small/Large
- The script automatically adjusts for screen size
- If issues persist, check browser zoom level
- For custom sizing, modify the CSS breakpoints

## Technical Details

### What's New in v1.0.7

#### Universal Compatibility
- Replaced all native dialogs with custom HTML modals
- Added three responsive breakpoints (mobile/tablet/desktop)
- Optimized touch targets for each device type
- Enhanced visual feedback across all platforms

#### Mobile Optimizations (≤900px)
- 44x44px minimum button sizes
- Vertical layout for narrow screens
- Larger fonts and icons
- Repositioned status chip

#### Tablet Optimizations (901-1400px)
- 32x32px button sizes
- Balanced horizontal layout
- Medium fonts and spacing
- Optimized for touch and mouse

#### Desktop Optimizations (≥1401px)
- 30x30px button sizes
- Compact horizontal layout
- Standard fonts and spacing
- Mouse-optimized interactions

### Browser Compatibility
- ✅ TornPDA (Android WebView)
- ✅ Chrome/Edge (Desktop & Mobile)
- ✅ Firefox (Desktop & Mobile)
- ✅ Safari (Desktop & iOS)
- ✅ iPad browsers (Safari, Chrome, Firefox)

### Permissions Required
- `GM_addStyle`: Inject responsive CSS
- `GM_registerMenuCommand`: Add menu options
- `GM_xmlhttpRequest`: API communication
- Connection to: `torn-calls.apps.gpu4.fusion.isys.hpc.dc.uq.edu.au`

## Comparison: Mobile vs Universal

### Mobile-Only Version (v1.0.6)
- Optimized specifically for phones
- Single mobile breakpoint at 900px
- Best for TornPDA users only

### Universal Version (v1.0.7) ⭐ Recommended
- Works on all devices
- Three responsive breakpoints
- Optimal experience everywhere
- Single script for all platforms

## Version History

**v1.0.7 (Universal)** - 2026-07-15
- Added tablet breakpoint (901-1400px)
- Added desktop breakpoint (1401px+)
- Optimized layouts for each device type
- Enhanced responsive design system
- Improved button sizing across breakpoints

**v1.0.6 (TornPDA Mobile)** - 2026-07-15
- Fixed API key prompt for Android devices
- Replaced native dialogs with custom HTML modals
- Enhanced touch targets for mobile
- Optimized for TornPDA WebView

**v1.0.5 (PDA Icon Fix)** - Previous
- Original version with basic mobile CSS
- Used native browser dialogs

## Support & Feedback

### For Script Issues
1. Check this documentation first
2. Verify you're using v1.0.7 (Universal)
3. Test on different screen sizes
4. Check browser console for errors

### For Faction-Specific Issues
- Contact Twilight - Reborn [56966] leadership
- Verify faction membership is active
- Ensure API key has correct permissions

## Best Practices

### For Mobile Users
- Use portrait mode for best layout
- Ensure good internet connection
- Keep TornPDA updated
- Clear cache if issues occur

### For Tablet Users
- Landscape mode recommended for iPad
- Use Safari or Chrome for best experience
- Enable touch mode in browser if available

### For Desktop Users
- Use latest browser version
- Keep userscript manager updated
- Zoom level at 100% recommended
- Use keyboard shortcuts for efficiency

## Security & Privacy

- API key stored locally in browser
- No data sent to third parties
- Only communicates with TWI Calls server
- Session tokens expire automatically
- All data encrypted in transit

## License
MIT License - See original script header for details

---

**Note:** This script is exclusive to **Twilight - Reborn [56966]** members. API key verification ensures faction membership before granting access to shared target calls.

## Quick Start Checklist

- [ ] Install userscript manager (if desktop/tablet)
- [ ] Install the script
- [ ] Create Torn API key named "Target Caller"
- [ ] Navigate to faction war page
- [ ] Enter API key when prompted
- [ ] Verify green status chip appears
- [ ] Test making a call on a target
- [ ] Test priority and assist flags
- [ ] Bookmark this documentation

**Enjoy coordinated faction warfare across all your devices! 🎯**