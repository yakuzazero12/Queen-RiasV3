// Required dependencies
const fs = require('fs');
const fetch = require('node-fetch'); // Install with `npm install node-fetch`
const pino = require('pino');
const readline = require('readline');
const chalk = require('chalk'); // For colored console output

// Baileys and related imports
const { 
    default: makeWASocket, 
    makeCacheableSignalKeyStore, 
    useMultiFileAuthState, 
    DisconnectReason, 
    fetchLatestBaileysVersion, 
    generateForwardMessageContent, 
    prepareWAMessageMedia, 
    generateWAMessageFromContent, 
    generateMessageID, 
    downloadContentFromMessage, 
    makeInMemoryStore, 
    jidDecode, 
    proto, 
    delay, 
    Browsers 
} = require('@whiskeysockets/baileys');

// Internal modules
const { loadCommands, handleIncomingMessages } = require('./handler'); // Command handling logic
const config = require('./config'); // Configuration file
const { handleGroupParticipantsUpdate } = require('./groupListener'); // Group participants update handler
const { executeCommand } = require('./commandHandler'); // Command execution logic
const antiLinkListener = require('./listeners/antilinkListener'); // Anti-link listener logic

// Repository raw file URLs for verification
const REPO_FILES = {
    "index.js": "https://raw.githubusercontent.com/username/repo/main/index.js", // Replace with your actual raw GitHub URL
    "commands/menu.js": "https://raw.githubusercontent.com/username/repo/main/commands/menu.js"
};

/**
 * Compare local file content with the repository version
 * @param {string} localFilePath - Path to the local file
 * @param {string} repoUrl - URL of the file in the repository
 * @returns {Promise<boolean>} - True if files match, false otherwise
 */
async function compareFiles(localFilePath, repoUrl) {
    try {
        const localContent = fs.readFileSync(localFilePath, 'utf-8');
        const response = await fetch(repoUrl);
        if (!response.ok) {
            throw new Error(`Failed to fetch ${repoUrl}: ${response.statusText}`);
        }
        const repoContent = await response.text();
        return localContent === repoContent;
    } catch (error) {
        console.error(chalk.red(`Error comparing files: ${error.message}`));
        return false;
    }
}

/**
 * Verify all critical files
 */
async function verifyFiles() {
    const filesToCheck = Object.entries(REPO_FILES);

    for (const [localFile, repoUrl] of filesToCheck) {
        const match = await compareFiles(localFile, repoUrl);
        if (!match) {
            console.error(chalk.red.bold(`🔒 Integrity check failed for ${localFile}! You Are Using A Cloned Or Modified Version Of Rias V3. Update Your Bot Or Deploy The Original Script`));
            process.exit(1); // Exit if any file is tampered
        } else {
            console.log(chalk.green.bold(`✅ Integrity check passed for ${localFile}.`));
        }
    }
}

// Main function to start the bot
async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState("session");
    const store = makeInMemoryStore({ logger: pino().child({ level: 'silent', stream: 'store' }) });

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    const question = (text) => {
        return new Promise((resolve) => rl.question(text, resolve));
    };

    const sock = makeWASocket({
        logger: pino({ level: "silent" }),
        printQRInTerminal: false,
        auth: state,
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 10000,
        browser: ["Ubuntu", "Chrome", "20.0.04"],
    });

    // Check if the user is registered
    if (!sock.authState.creds.registered) {
        const phoneNumber = await question('Please provide your phone number with the country code 🚀:\n');
        try {
            let code = await sock.requestPairingCode(phoneNumber); // Get the pairing code
            code = code?.match(/.{1,4}/g)?.join("-") || code; // Format the code
            console.log(`✨ Your exclusive pairing code (Powered by Toxxic Boy):`, chalk.blue(code));
        } catch (error) {
            console.error(chalk.red('🔥 Error requesting pairing code. Please try again:', error.message));
            rl.close(); // Close readline if there is an error
            return;
        }
    }

    // Load commands and log the count of loaded commands
    const commands = loadCommands(sock);
    console.log(chalk.green(`Loaded ${Object.keys(commands).length} commands.`));

    // Attach event listeners for group participant updates
    sock.ev.on('group-participants.update', async (update) => {
        await handleGroupParticipantsUpdate(update, sock);
    });

    // Attach the anti-link listener
    await antiLinkListener(sock); // Anti-link listener to prevent sharing links in groups

    // Listen to incoming messages and execute commands
    await handleIncomingMessages(sock, commands); // Call the function to handle incoming messages

    // Save credentials on updates
    sock.ev.on('creds.update', saveCreds);

    // Handle connection updates
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        const timestamp = new Date().toLocaleString(); // Get the current timestamp

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;

            // Log the detailed information on connection close
            console.log(chalk.bgRed.bold.white(`[${timestamp}] Connection lost!`));
            console.log(chalk.yellow(`\nReason: ${lastDisconnect.error?.output?.statusCode || 'Unknown Error'}`));

            if (shouldReconnect) {
                console.log(chalk.yellow(`\nAttempting to reconnect...`));
                startBot(); // Restart bot if not logged out
            } else {
                console.log(chalk.red(`\nBot logged out. Please check credentials.`));
            }
        } else if (connection === 'open') {
            // Log additional information on successful connection
            console.log(chalk.bgBlack.bold.green(`[${timestamp}] 𝐑𝐈𝐀𝐒 𝐆𝐑𝐄𝐌𝐎𝐑𝐄𝐘 𝐕𝟑 Connected`)); // Connection successful message
            console.log(chalk.bold.magenta('\n══════════════════════════════════════════════════════════'));
            console.log(chalk.cyan(`             🌟 𝐑𝐈𝐀𝐒 𝐕𝟑 𝐈𝐬 𝐍𝐎𝐖 𝐎𝐍𝐋𝐈𝐍𝐄 🌟`));
            console.log(chalk.bold.yellow(`\n           ⚡️ 𝐌𝐀𝐃𝐄 𝐁𝐘 𝐓𝐎𝐗𝐗𝐈𝐂 𝐁𝐎𝐘 ⚡️`));
            console.log(chalk.magenta('══════════════════════════════════════════════════════════\n'));
            console.log(chalk.green(`[${timestamp}] Connection successfully established! Rias V3 is now online.`));
            console.log(chalk.green(`Rias version: 𝐕𝟑 | Status: ONLINE`));
            console.log(chalk.green(`🏷️ Last Disconnect Status: ${lastDisconnect?.error?.output?.statusCode || 'No disconnection information'}`));
            console.log(chalk.green(`⚙️ Current Server Time: ${timestamp}`));
        }
    });

    // Bind the store to the socket events
    store.bind(sock.ev);

    rl.close(); // Close the readline interface
}

// Verify files before starting the bot
verifyFiles().then(() => {
    console.log(chalk.cyan.bold("✨ All files verified. Starting the bot..."));
    startBot(); // Call your bot's start function if verification passes
});