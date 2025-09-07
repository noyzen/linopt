# Linopt - The Smart SystemD Manager for Linux

<p align="center">
  <em>Services View</em><br>
  <img src="https://i.imgur.com/ijYVXrv.jpeg" alt="Linopt Services View">
</p>
<p align="center">
  <em>Changes View</em><br>
  <img src="https://i.imgur.com/sq4x7Z9.jpeg" alt="Linopt Changes View">
</p>
<p align="center">
  <em>Game Mode View</em><br>
  <img src="https://i.imgur.com/GL0wPVP.jpeg" alt="Linopt Game Mode View">
</p>

Linopt is a sleek, modern, and powerful graphical user interface (GUI) for managing SystemD services on Linux. Designed for developers, sysadmins, and gamers, it simplifies system optimization with an intuitive interface and powerful features like the one-click **Game Mode**.

## ✨ Core Features

- **Comprehensive Service Management**: View, start, stop, restart, enable, and disable both system and user-level SystemD services with ease.
- **🚀 Game Mode for Peak Performance**:
    - **Intelligent Suggestions**: Automatically detects non-essential running services that are safe to stop, while protecting critical system processes.
    - **One-Click Optimization**: Activate Game Mode to instantly stop the selected services and free up system resources.
    - **Fully Customizable**: Add any service to the stop list or remove suggestions you want to keep running.
    - **Safe & Reversible**: Deactivating Game Mode restores all stopped services to their previous state. If anything goes wrong, a simple reboot provides a clean slate.
- **Live System Monitoring**: The service list updates in real-time as services change state. Toggle this feature off for manual refresh control.
- **Powerful Filtering & Search**: Instantly find services with a fast search bar and advanced filter dropdowns (running, stopped, enabled, etc.).
- **At-a-Glance Dashboard**: A clean header provides key statistics: total, running, and enabled-on-boot services.
- **Persistent Change Auditing**: Every action you take is logged and saved across sessions. Logs are automatically grouped by date for easy review.
- **Modern & Responsive UI**: A beautiful, animated interface with a dynamic "aurora" background and a layout that adapts to smaller window sizes.
- **Safety First**: Confirmation dialogs for critical actions help prevent accidental system changes.
- **Export Functionality**: Save your current filtered list of services to a text file.

## 🕹️ How to Use

### Main Views
Navigate between the three main sections using the buttons at the top:
- **Services**: The main dashboard for managing all SystemD services.
- **Changes**: A historical log of all actions performed in Linopt.
- **Game Mode**: Configure and activate a performance-optimized state for your system.

### Services View
- **Live Updates**: This toggle (on by default) controls automatic list updates. When off, a "Refresh" button appears.
- **Filtering**: Use the search bar and the filter dropdown to quickly narrow down the service list.
- **User Services**: Toggle "Show User Services" to include services running under your user account.
- **Actions**:
    - **Enable on Boot**: Use the toggle to control if a service starts when you log in.
    - **Start/Stop/Restart**: Control the current state of a service.
    - **Add to Game Mode**: Click the controller icon to add a service to the Game Mode stop list.

### Changes View
- This view shows a complete, timestamped history of all actions performed through the app.
- The log is persistent and grouped by date.
- Use the search and filter dropdowns to find specific log entries.
- You can clear the entire log using the "Clear Log" button.

### Game Mode View
This view is split into two panels: a control panel on the left and a service list on the right.

1.  **Configure Your List (Game Mode Off)**:
    - On first launch, Linopt intelligently populates the "Services to Stop" list with safe, non-essential services.
    - **Customize**: Remove any service from the list by clicking the `X` button. Add more services from the main **Services View**.
    - **Reset**: Click the "Reset" button to clear your customizations and re-populate the list with fresh intelligent suggestions.

2.  **Activate**:
    - Click the big "Activate" button. Linopt will stop all *currently running* services from your list.

3.  **Enjoy Optimized Performance (Game Mode On)**:
    - The right panel now shows an "Active Session" summary, listing how many services were stopped.
    - The control panel shows a list of the services that were actually stopped.
    - You can safely close Linopt; the system will remain optimized.

4.  **Deactivate**:
    - Re-open Linopt and click the "Deactivate" button. Linopt will restart all the services that it previously stopped, returning your system to its normal state.

---

## 🚀 Installation

Pre-built binaries for Linux are available on the project's **Releases page**.

Download the latest `.AppImage` file, make it executable, and run it:

```bash
chmod +x Linopt-*.AppImage
./Linopt-*.AppImage
```

## 🛠️ Development & Building from Source

If you want to run the latest version or contribute to the project, you can build Linopt from source.

### Prerequisites

- [Node.js](https://nodejs.org/) (v16 or later)
- [npm](https://www.npmjs.com/) or [yarn](https://yarnpkg.com/)

### Running in Development Mode

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/your-repo/linopt.git
    cd linopt
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Start the application:**
    ```bash
    npm start
    ```
    This will launch the Electron app with developer tools enabled.

### Building for Production

To build a distributable package (e.g., an AppImage for Linux), run:

```bash
npm run electron:build
```
The output files will be located in the `dist/` directory.

---

Made with ❤️ by the Linopt team.