# TWI Faction Calls - TornPDA Mobile Installation Guide

## Overview
This is a mobile-optimized version of the TWI Faction Calls userscript, specifically designed to work with **TornPDA on Android devices** (tested on Galaxy S26).

**Version:** 1.0.6 (TornPDA Mobile)  
**Original Authors:** Leandria & Wolf  
**Mobile Optimization:** Bob

## What's Fixed for Mobile

### Critical Fix
✅ **API Key Input Now Works on Android**
- Replaced native `prompt()` dialogs with custom HTML modals that work in TornPDA's WebView
- All dialogs (API key input, alerts, confirmations) now display properly on mobile

### Mobile Enhancements
✅ **Touch-Friendly Interface**
- All buttons meet minimum 44x44px touch target size
- Improved spacing and layout for finger taps
- Enhanced visual feedback for touch interactions

✅ **Optimized Layout**
- Responsive design that adapts to mobile screen sizes
- Better button arrangement in narrow viewports
- Status chip repositioned to avoid conflicts with TornPDA UI

✅ **Better User Experience**
- Smooth animations for modal dialogs
- Dark theme optimized for mobile viewing
- Larger fonts and icons for readability

## Installation Instructions

### Step 1: Install TornPDA
1. Download and install **TornPDA** from the Google Play Store
2. Open TornPDA and log into your Torn account

### Step 2: Enable Userscripts in TornPDA
1. Open TornPDA settings
2. Navigate to **Browser Settings** or **Advanced Settings**
3. Enable **Userscripts** or **Custom Scripts** support
4. Note the userscript directory location (usually in your device storage)

### Step 3: Install the Script
1. Download `TWI_Faction_Calls_v1.0.6_TornPDA_Mobile.user.js` to your device
2. Move the file to TornPDA's userscript directory
3. Restart TornPDA or reload the browser

**Alternative Method:**
- Some versions of TornPDA allow you to paste the script content directly in settings
- Copy the entire contents of the `.user.js` file
- Paste into TornPDA's userscript editor

### Step 4: Configure Your API Key
1. Navigate to Torn's faction war page: `https://www.torn.com/factions.php#/war/`
2. The script will automatically prompt you for your API key
3. Enter your **16-character Torn Public API key** named "Target Caller"
4. The key is stored locally and only used to verify faction membership

**Creating an API Key:**
1. Go to https://www.torn.com/preferences.php#tab=api
2. Create a new **Public** API key
3. Name it "Target Caller"
4. Copy the 16-character key
5. Paste it into the script's prompt

## Usage

### On the War Page
Once installed and configured, you'll see:

1. **Status Chip** (bottom-right corner)
   - Green "TWI Calls ✓" = Connected
   - Red "TWI Calls !" = Disconnected
   - Tap to view connection status

2. **Call Buttons** (on each enemy target)
   - **Green CALL button** = Available to claim
   - **Red timer button** = Already called (shows countdown)
   - **Star icon** = Toggle priority flag
   - **Speaker icon** = Toggle assist request

### Making Calls
1. Tap the green **CALL** button next to a target
2. Your call is shared with all faction members
3. Timer shows remaining time (default: varies by server)
4. Tap your own call to release it early

### Priority & Assist Flags
- **Star (Priority)**: Marks high-priority targets (yellow highlight)
- **Speaker (Assist)**: Requests backup (orange outline)
- Only the person who made the call can toggle these flags

### Auto-Clear Feature
- Calls automatically clear when targets are hospitalized or jailed
- No manual cleanup needed

## Troubleshooting

### API Key Prompt Not Appearing
✅ **FIXED** - This version uses custom HTML dialogs that work in TornPDA

### Script Not Loading
- Verify the file is in the correct userscript directory
- Check that userscripts are enabled in TornPDA settings
- Restart TornPDA completely
- Check TornPDA's console for error messages

### Connection Issues
- Tap the status chip to view detailed connection info
- Verify your API key is exactly 16 characters
- Ensure you're a member of Twilight - Reborn [56966]
- Check your internet connection

### Buttons Too Small
- This version already has 44x44px minimum touch targets
- If still too small, check your device's display scaling settings

### Layout Issues
- Clear TornPDA's cache
- Ensure you're using the latest version of TornPDA
- Try rotating your device (portrait/landscape)

## Menu Commands

Access these from TornPDA's userscript menu (if supported):

1. **Set Target Caller API Key** - Change or update your API key
2. **Connection Status** - View detailed connection information
3. **Forget API Key** - Remove saved credentials

## Technical Details

### What Changed from v1.0.5
- Replaced `prompt()` with `showPrompt()` (custom HTML modal)
- Replaced `alert()` with `showAlert()` (custom HTML modal)
- Replaced `confirm()` with `showConfirm()` (custom HTML modal)
- Increased button sizes to 44x44px minimum for touch targets
- Enhanced mobile CSS with better spacing and layout
- Improved status chip positioning for mobile devices
- Added smooth animations for modal dialogs
- Optimized for WebView environments

### Browser Compatibility
- ✅ TornPDA (Android WebView)
- ✅ Chrome Mobile
- ✅ Firefox Mobile
- ✅ Desktop browsers (backward compatible)

### Permissions Required
- `GM_addStyle` - Inject custom CSS
- `GM_registerMenuCommand` - Add menu options
- `GM_xmlhttpRequest` - API communication
- Connection to: `torn-calls.apps.gpu4.fusion.isys.hpc.dc.uq.edu.au`

## Support

### For Script Issues
- Check this documentation first
- Verify you're using the mobile-optimized version (v1.0.6)
- Test on the desktop version to isolate mobile-specific issues

### For Faction-Specific Issues
- Contact Twilight - Reborn [56966] leadership
- Verify your faction membership is active

## Version History

**v1.0.6 (TornPDA Mobile)** - 2026-07-15
- Fixed API key prompt not appearing on Android devices
- Replaced all native dialogs with custom HTML modals
- Enhanced touch targets and mobile layout
- Optimized for TornPDA WebView environment

**v1.0.5 (PDA Icon Fix)** - Previous version
- Original version with basic mobile CSS
- Used native browser dialogs (incompatible with some mobile browsers)

## License
MIT License - See original script header for details

---

**Note:** This script only works for members of **Twilight - Reborn [56966]**. The API key verification ensures faction membership before allowing access to shared target calls.