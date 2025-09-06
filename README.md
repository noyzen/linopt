# Linopt - SystemD Manager

![Linopt Screenshot](https://i.imgur.com/gA3O02N.png)

Linopt is a sleek, modern, and powerful graphical user interface (GUI) for managing SystemD services on Linux. Built with Electron, it provides a user-friendly and reactive experience for developers, system administrators, and power users who prefer a visual tool over the command line.

## ✨ Features

- **Comprehensive Service Management**: View, start, stop, restart, enable, and disable both system and user-level SystemD services.
- **Live System Monitoring**: The service list updates in real-time as services change state on your system. No manual refreshes needed! You can also toggle this feature off for manual control.
- **Powerful Filtering**: Instantly find services with a fast and responsive search bar.
- **At-a-Glance Dashboard**: A clean dashboard provides key statistics: total services, currently running services, and services enabled on boot.
- **Persistent Change Auditing**: Every action you take is logged. The log is saved across application restarts, so you always have a history of your changes.
- **Intelligent Log Grouping**: Logs are automatically categorized by date (Today, Yesterday, Last Week, etc.) for easy navigation.
- **Safety First**: Confirmation dialogs for all critical actions (like stopping or disabling a service) help prevent accidental changes.
- **Modern & Fancy UI**: A beautiful, animated interface with a dynamic "aurora" background makes system management a pleasure.

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

## 🕹️ How to Use

- **Switching Views**: Use the "Services" and "Changes" buttons at the top to navigate between the main views.
- **Services View**:
    - **Live Updates**: This toggle (on by default) controls whether the list updates automatically. When off, a "Refresh" button appears for manual updates.
    - **Filtering**: Use the search bar to filter the list of services by name.
    - **User Services**: Toggle "Show User Services" to include services running under your user account.
    - **Actions**: Each service has controls to enable/disable on boot, and buttons to start, stop, and restart it.
- **Changes View**:
    - This view shows a complete history of all actions performed through the app.
    - The log is persistent and grouped by date.
    - You can clear the log using the "Clear Log" button.

---

Made with ❤️ by the Linopt team.
