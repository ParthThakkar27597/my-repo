const { Client, MessageMedia } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const fs = require("fs");
const xlsx = require("xlsx");
const path = require("path");

// Default country code
const DEFAULT_COUNTRY_CODE = "91"; // Change this as per your country

// Delay bounds in milliseconds
const MIN_DELAY = 60 * 1000; // 1 minute
const MAX_DELAY = 3 * 60 * 1000; // 3 minutes

// Initialize WhatsApp client
const client = new Client();

let isLoggedIn = false; // Track if logged in

client.on("qr", (qr) => {
  console.log("Scan this QR code with your WhatsApp:");
  qrcode.generate(qr, { small: true });
});

client.on("ready", () => {
  isLoggedIn = true;
  console.log("WhatsApp Web is ready!");
  sendMessages();
});

client.on("authenticated", () => {
  console.log("Authenticated with WhatsApp Web!");
});

client.on("auth_failure", (msg) => {
  console.error("Authentication failed:", msg);
  isLoggedIn = false;
});

client.on("disconnected", (reason) => {
  console.error("WhatsApp disconnected:", reason);
  isLoggedIn = false;
  client.initialize(); // Re-initialize to generate a new QR code
});

client.initialize();

// Load the message template
const messageTemplate = fs.readFileSync("./message.txt", "utf8");

// Load the attachment (image) from the public folder
const imagePath = path.resolve("./public/image.jpg"); // Change the filename if needed
const media = MessageMedia.fromFilePath(imagePath);

// Function to send messages
async function sendMessages() {
  const filePath = "./contacts.xlsx"; // Path to the input Excel file
  const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

  console.log(`Found ${data.length} contacts in the Excel file.`);

  const results = [];
  let successCount = 0;
  let failedCount = 0;
  let unregisteredCount = 0;
  let incorrectCount = 0;

  for (const row of data) {
    const name = row["Name"];
    let number = row["Phone"];

    if (!number || isNaN(number)) {
      results.push({ Name: name, Phone: number, Status: "number incorrect" });
      incorrectCount++;
      continue;
    }

    // Add country code if missing
    number = sanitizeNumber(DEFAULT_COUNTRY_CODE, number);
    const formattedNumber = `${number}@c.us`;

    try {
      // Check if the number is registered on WhatsApp
      const isRegistered = await client.isRegisteredUser(formattedNumber);

      if (!isRegistered) {
        results.push({
          Name: name,
          Phone: number,
          Status: "not registered on whatsapp",
        });
        unregisteredCount++;
        continue;
      }

      // Customize the message
      const personalizedMessage = messageTemplate.replace("{{NAME}}", name);

      // Send the message with attachment
      await client.sendMessage(formattedNumber, personalizedMessage, { media });
      console.log(`Message sent to ${name}: ${number}`);
      successCount++;

      // Add delay between messages
      const delay = getRandomDelay(MIN_DELAY, MAX_DELAY);
      console.log(
        `Waiting for ${delay / 1000} seconds before sending the next message...`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    } catch (err) {
      console.error(`Failed to send message to ${name}: ${number}`, err);
      results.push({ Name: name, Phone: number, Status: "message not sent" });
      failedCount++;
    }
  }

  // Write results to an Excel file
  const outputWorkbook = xlsx.utils.book_new();
  const outputSheet = xlsx.utils.json_to_sheet(results);
  xlsx.utils.book_append_sheet(outputWorkbook, outputSheet, "Results");
  xlsx.writeFile(outputWorkbook, "./results.xlsx");
  console.log("Results saved to results.xlsx");

  // Print summary report
  console.log("Summary Report:");
  console.log(`Total Contacts: ${data.length}`);
  console.log(`Messages Sent Successfully: ${successCount}`);
  console.log(`Failed Messages: ${failedCount}`);
  console.log(`Unregistered Numbers: ${unregisteredCount}`);
  console.log(`Incorrect Numbers: ${incorrectCount}`);
}

function sanitizeNumber(countryCode, number) {
  const sanitized_number = number.toString().replace(/\D+/g, ""); // Remove unnecessary characters
  const finalNumber = `${countryCode}${sanitized_number.substring(
    sanitized_number.length - 10
  )}`; // Add country code (91 for India)
  return finalNumber;
}

function getRandomDelay(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
