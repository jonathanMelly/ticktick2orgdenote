#!/usr/bin/env node

// TickTick to Org-mode and Denote Converter
// Usage: node ticktick-to-org-denote.js input.csv output_dir [--with-signature]

const fs = require('fs');
const path = require('path');
const Papa = require('papaparse');

// Parse command line arguments
let args = process.argv.slice(2);
let withSignature = false;

// Check if --with-signature flag is present
if (args.includes('--with-signature')) {
  withSignature = true;
  args = args.filter(arg => arg !== '--with-signature');
}

// Check command line arguments
if (args.length !== 2) {
  console.log('Usage: node ticktick-to-org-denote.js input.csv output_directory [--with-signature]');
  console.log('\n  --with-signature   Add signature (unique ID) to Denote filenames');
  process.exit(1);
}

const inputFile = args[0];
const outputDir = args[1];

// Create output directories
const orgDir = path.join(outputDir, 'org');
const denoteDir = path.join(outputDir, 'denote');

if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
if (!fs.existsSync(orgDir)) fs.mkdirSync(orgDir);
if (!fs.existsSync(denoteDir)) fs.mkdirSync(denoteDir);

// Utility function to convert TickTick dates to Org format
function convertDateForOrg(tickTickDate) {
  if (!tickTickDate) return null;
  
  try {
    const date = new Date(tickTickDate);
    // Org-mode expects format: [YYYY-MM-DD HH:MM] or <YYYY-MM-DD HH:MM>
    const dateStr = date.toISOString().replace('T', ' ').slice(0, 16);
    return dateStr;
  } catch (e) {
    return tickTickDate; // fallback to original format if parsing fails
  }
}

// Utility function to convert TickTick recurrence to Org-mode format
function convertRecurrenceToOrg(repeat) {
  if (!repeat) return null;
  
  // Parse TickTick repeat format and convert to Org format
  const repeatMap = {
    'DAILY': '+1d',
    'WEEKDAY': '.+1d',  // Weekdays only
    'WEEKLY': '+1w',
    'MONTHLY': '+1m',
    'YEARLY': '+1y'
  };
  
  // Extract base recurrence type
  for (const [key, value] of Object.entries(repeatMap)) {
    if (repeat.toUpperCase().includes(key)) {
      return value;
    }
  }
  
  // Handle numbered recurrences (e.g., "Every 2 days", "3-week")
  if (repeat.match(/(\d+)\s*(DAY|WEEK|MONTH|YEAR)S?/i)) {
    const [, number, unit] = repeat.match(/(\d+)\s*(DAY|WEEK|MONTH|YEAR)S?/i);
    const unitChar = unit[0].toLowerCase();
    return `+${number}${unitChar}`;
  }
  
  // Handle "Every Monday", "Every 2 Tuesday", etc.
  const weekdays = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
  const weekdayMatch = repeat.match(/(EVERY\s)?(\d+\s)?(MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY)/i);
  if (weekdayMatch) {
    const [, , number, weekday] = weekdayMatch;
    const n = number ? parseInt(number) : 1;
    return `.+${n}w`;
  }
  
  // Default case - return original if no match
  return repeat;
}

// Utility function to create Denote filename
function createDenoteFilename(title, tags, createdDate, withSignature = false) {
  // Denote format: DATE[==SIGNATURE]--TITLE__KEYWORDS.EXTENSION
  const date = new Date(createdDate || Date.now());
  const dateStr = date.toISOString().replace(/[-:]/g, '').split('.')[0].replace('T', 'T');
  
  let filename = dateStr;
  
  // Add signature if requested
  if (withSignature) {
    const signature = Math.random().toString(36).substring(2, 15);
    filename += `==${signature}`;
  }
  
  // Sanitize title for filename - replace accented chars and special characters
  const safeTitle = title
    .normalize('NFD')  // Decompose accented characters
    .replace(/[\u0300-\u036f]/g, '')  // Remove diacritical marks
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  
  filename += `--${safeTitle}`;
  
  // Sanitize tags for keywords
  const keywords = tags
    .map(tag => tag
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
    )
    .filter(tag => tag.length > 0)
    .join('_');
  
  if (keywords) {
    filename += `__${keywords}`;
  }
  
  return `${filename}.org`;
}

// Main conversion function
function convertTickTickData(tickTickData, withSignature = false) {
  let orgContent = "#+TITLE: TickTick Tasks Backup\n#+DATE: " + new Date().toISOString().split('T')[0] + "\n\n";
  let archiveContent = "";
  const denoteFiles = [];
  
  // Separate items by type
  const notes = tickTickData.filter(task => task["Kind"] === "NOTE");
  
  // Items in "Checklists" folder should go to Denote
  const checklistItems = tickTickData.filter(task => 
    task["Folder Name"] === "Checklists"
  );
  
  // Regular tasks are everything else
  const regularTasks = tickTickData.filter(task => 
    task["Kind"] !== "NOTE" && task["Folder Name"] !== "Checklists"
  );
  
  // Further separate regular tasks by status
  const todoTasks = regularTasks.filter(task => task["Status"] === "0");
  const doneTasks = regularTasks.filter(task => task["Status"] === "1");
  const archivedTasks = regularTasks.filter(task => task["Status"] === "2");
  
  // Active tasks include both TODO and DONE (but not archived)
  const activeTasks = [...todoTasks, ...doneTasks];
  
  // Initialize archive file if needed
  if (archivedTasks.length > 0) {
    archiveContent = "#+TITLE: TickTick Archived Tasks\n#+DATE: " + new Date().toISOString().split('T')[0] + "\n\n";
    archiveContent += "* Archived Tasks\n\n";
  }
  
  // Function to process tasks into org format
  function processTasks(tasks, isArchive = false) {
    let content = isArchive ? "" : "* Tasks\n\n";
    
    // Group tasks by Folder and List
    const grouped = {};
    
    tasks.forEach(task => {
      const folder = task["Folder Name"] || "Inbox";
      const list = task["List Name"] || "Default";
      
      if (!grouped[folder]) {
        grouped[folder] = {};
      }
      if (!grouped[folder][list]) {
        grouped[folder][list] = [];
      }
      grouped[folder][list].push(task);
    });
    
    // Convert to Org-mode format
    for (const folder in grouped) {
      content += `** ${folder}\n`;
      
      for (const list in grouped[folder]) {
        content += `*** ${list}\n`;
        
        grouped[folder][list].forEach(task => {
          // Determine task status
          let status = "TODO";
          if (task["Status"] === "1") status = "DONE";
          else if (task["Status"] === "2") status = isArchive ? "DONE" : "ARCHIVED";
          else if (task["Status"] === "0") status = "TODO";
          
          // Build task title
          let taskTitle = task["Title"] || "Untitled";
          
          content += `**** ${status} ${taskTitle}`;
          
          // Add tags
          if (task["Tags"]) {
            const tags = task["Tags"].split(',').map(tag => tag.trim().replace(/\s+/g, '_'));
            if (tags.length > 0 && tags[0] !== "") {
              content += ` :${tags.join(':')}:`;
            }
          }
          
          content += "\n";
          
          // Add SCHEDULED and DEADLINE dates with recurrence
          const schedDate = convertDateForOrg(task["Start Date"]);
          const dueDate = convertDateForOrg(task["Due Date"]);
          const recurrence = convertRecurrenceToOrg(task["Repeat"]);
          
          // If start and due dates are the same, only use SCHEDULED
          if (schedDate && dueDate && schedDate === dueDate) {
            content += `     SCHEDULED: <${schedDate}${recurrence ? ' ' + recurrence : ''}>\n`;
          } else {
            if (schedDate) {
              content += `     SCHEDULED: <${schedDate}${recurrence ? ' ' + recurrence : ''}>\n`;
            }
            if (dueDate) {
              content += `     DEADLINE: <${dueDate}${recurrence ? ' ' + recurrence : ''}>\n`;
            }
          }
          
          // Add content if available
          if (task["Content"]) {
            const taskContent = task["Content"].replace(/\r/g, '').split('\n');
            taskContent.forEach(line => {
              if (line.trim()) {
                content += `     ${line.trim()}\n`;
              }
            });
          }
          
          // Add metadata as properties
          content += "     :PROPERTIES:\n";
          
          if (task["Priority"] && task["Priority"] !== "0") {
            content += `     :PRIORITY: ${task["Priority"]}\n`;
          }
          
          if (task["Reminder"]) {
            content += `     :REMINDER: ${task["Reminder"]}\n`;
          }
          
          if (task["Repeat"]) {
            const orgRecurrence = convertRecurrenceToOrg(task["Repeat"]);
            content += `     :REPEAT: ${orgRecurrence || task["Repeat"]}\n`;
          }
          
          if (task["Created Time"]) {
            content += `     :CREATED: ${task["Created Time"]}\n`;
          }
          
          if (task["Completed Time"]) {
            content += `     :COMPLETED: ${task["Completed Time"]}\n`;
          }
          
          if (task["Timezone"]) {
            content += `     :TIMEZONE: ${task["Timezone"]}\n`;
          }
          
          if (task["taskId"]) {
            content += `     :TICKTICK_ID: ${task["taskId"]}\n`;
          }
          
          if (task["parentId"]) {
            content += `     :PARENT_ID: ${task["parentId"]}\n`;
          }
          
          if (task["Is Check list"] === "Y") {
            content += `     :IS_CHECKLIST: Yes\n`;
          }
          
          content += "     :END:\n\n";
        });
      }
    }
    
    return content;
  }
  
  // Group checklist items by list name
  const checklistsByList = {};
  
  checklistItems.forEach(item => {
    const list = item["List Name"] || "General";
    
    if (!checklistsByList[list]) {
      checklistsByList[list] = [];
    }
    
    checklistsByList[list].push(item);
  });
  
  // Process each list as a separate Denote file
  Object.entries(checklistsByList).forEach(([list, items]) => {
    // Create one Denote file per list
    const title = list;
    const tags = ['checklist'];
    
    // Find the oldest creation date for this list's items
    let oldestCreationTime = new Date();
    items.forEach(item => {
      if (item["Created Time"]) {
        const itemDate = new Date(item["Created Time"]);
        if (itemDate < oldestCreationTime) {
          oldestCreationTime = itemDate;
        }
      }
    });
    
    const filename = createDenoteFilename(title, tags, oldestCreationTime, withSignature);
    
    // Generate identifier based on date
    const dateId = oldestCreationTime.toISOString().replace(/[-:]/g, '').split('.')[0].replace('T', 'T');
    let identifier = dateId;
    
    if (withSignature) {
      const signature = filename.match(/==([a-z0-9]+)--/)?.[1];
      if (signature) identifier += `==${signature}`;
    }
    
    let noteContent = `#+TITLE: ${title}\n`;
    noteContent += `#+DATE: ${convertDateForOrg(oldestCreationTime) || new Date().toISOString().slice(0, 16)}\n`;
    noteContent += `#+FILETAGS: :checklist:\n`;
    noteContent += `#+IDENTIFIER: ${identifier}\n\n`;
    
    // Add each item as a checkbox
    items.forEach(item => {
      const status = item["Status"] === "1" ? "X" : " ";
      const itemTitle = item["Title"] || "Untitled";
      
      noteContent += `- [${status}] ${itemTitle}\n`;
      
      // Add content if available and different from title
      if (item["Content"] && item["Content"] !== itemTitle) {
        const content = item["Content"].replace(/\r/g, '').split('\n');
        content.forEach(line => {
          if (line.trim().match(/^[▫▪•-]/)) {
            // Convert nested bullet to sub-checkbox
            const text = line.trim().replace(/^[▫▪•-]\s*/, '');
            noteContent += `  - [ ] ${text}\n`;
          } else if (line.trim()) {
            noteContent += `  ${line.trim()}\n`;
          }
        });
      }
      
      noteContent += "\n";
    });
    
    noteContent += "\n#+begin_comment\nSource: TickTick Checklist\n";
    noteContent += `Folder: Checklists\n`;
    noteContent += `List: ${list}\n`;
    noteContent += `Created: ${oldestCreationTime.toISOString()}\n`;
    noteContent += "#+end_comment\n";
    
    denoteFiles.push({
      filename,
      content: noteContent,
      modifiedTime: oldestCreationTime
    });
  });
  
  // Process notes as Denote files
  notes.forEach(note => {
    const title = note["Title"] || "Untitled Note";
    const tags = note["Tags"] ? note["Tags"].split(',').map(tag => tag.trim()) : [];
    const filename = createDenoteFilename(title, tags, note["Created Time"], withSignature);
    
    // Generate identifier based on date (same format as in filename)
    const dateObj = new Date(note["Created Time"] || Date.now());
    const dateId = dateObj.toISOString().replace(/[-:]/g, '').split('.')[0].replace('T', 'T');
    let identifier = dateId;
    
    if (withSignature) {
      const signature = filename.match(/==([a-z0-9]+)--/)?.[1];
      if (signature) identifier += `==${signature}`;
    }
    
    let noteContent = `#+TITLE: ${title}\n`;
    noteContent += `#+DATE: ${convertDateForOrg(note["Created Time"]) || new Date().toISOString().slice(0, 16)}\n`;
    noteContent += `#+FILETAGS: ${tags.map(tag => ':' + tag.replace(/\s+/g, '_')).join('')}\n`;
    noteContent += `#+IDENTIFIER: ${identifier}\n\n`;
    
    if (note["Content"]) {
      noteContent += note["Content"].replace(/\r/g, '');
    }
    
    noteContent += "\n\n#+begin_comment\nSource: TickTick\n";
    if (note["Folder Name"]) noteContent += `Folder: ${note["Folder Name"]}\n`;
    if (note["List Name"]) noteContent += `List: ${note["List Name"]}\n`;
    if (note["Created Time"]) noteContent += `Created: ${note["Created Time"]}\n`;
    noteContent += "#+end_comment\n";
    
    denoteFiles.push({ 
      filename, 
      content: noteContent,
      modifiedTime: note["Created Time"]  // Store date to set filesystem timestamp
    });
  });
  
  // Process active tasks
  orgContent += processTasks(activeTasks);
  
  // Process archived tasks
  if (archivedTasks.length > 0) {
    archiveContent += processTasks(archivedTasks, true);
  }
  
  return { orgContent, archiveContent, denoteFiles };
}

// Main execution
console.log('TickTick to Org-mode and Denote Converter');
console.log('=======================================');
console.log(`Signature mode: ${withSignature ? 'ENABLED' : 'DISABLED'}`);
console.log('- Notes go to Denote files');
console.log('- All tasks from "Checklists" folder go to Denote files, grouped by list');
console.log('- One Denote file per list in Checklists folder');
console.log('- When SCHEDULED and DEADLINE are identical, only SCHEDULED is used');

// Read the TickTick CSV backup file
fs.readFile(inputFile, 'utf8', (err, data) => {
  if (err) {
    console.error('Error reading file:', err);
    process.exit(1);
  }

  // Find the actual CSV data (skipping metadata)
  const lines = data.split('\n');
  let dataStartIndex = -1;
  
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('"Folder Name"') && lines[i].includes('"List Name"')) {
      dataStartIndex = i;
      break;
    }
  }

  if (dataStartIndex === -1) {
    console.error('Could not find CSV data start');
    process.exit(1);
  }

  // Extract and parse the actual CSV data
  const csvData = lines.slice(dataStartIndex).join('\n');
  
  Papa.parse(csvData, {
    header: true,
    skipEmptyLines: true,
    complete: function(results) {
      console.log(`\nProcessing ${results.data.length} items...`);
      
      const { orgContent, archiveContent, denoteFiles } = convertTickTickData(results.data, withSignature);
      
      // Write main org file
      const orgFile = path.join(orgDir, 'ticktick-backup.org');
      fs.writeFile(orgFile, orgContent, 'utf8', (err) => {
        if (err) {
          console.error('Error writing org file:', err);
          process.exit(1);
        }
        console.log(`\nSuccessfully created org file: ${orgFile}`);
        console.log(`Tasks written: ${orgContent.match(/\*\*\*/g)?.length || 0}`);
      });
      
      // Write archive org file if there are archived tasks
      if (archiveContent) {
        const archiveFile = path.join(orgDir, 'ticktick-backup_archive.org');
        fs.writeFile(archiveFile, archiveContent, 'utf8', (err) => {
          if (err) {
            console.error('Error writing archive file:', err);
          } else {
            console.log(`Successfully created archive file: ${archiveFile}`);
            console.log(`Archived tasks written: ${archiveContent.match(/\*\*\*/g)?.length || 0}`);
          }
        });
      }
      
      // Write denote files
      let denoteCount = 0;
      console.log(`\nProcessing ${denoteFiles.length} Denote files...`);
      
      denoteFiles.forEach(({ filename, content, modifiedTime }) => {
        const filePath = path.join(denoteDir, filename);
        fs.writeFile(filePath, content, 'utf8', (err) => {
          if (err) {
            console.error(`Error writing denote file ${filename}:`, err);
          } else {
            // Set the file modification time to match the note date if available
            if (modifiedTime) {
              const time = new Date(modifiedTime).getTime() / 1000;  // Convert to seconds
              fs.utimes(filePath, time, time, (err) => {
                if (err) {
                  console.error(`Error setting time for ${filename}:`, err);
                }
              });
            }
            
            denoteCount++;
            if (denoteCount === denoteFiles.length) {
              console.log(`Successfully created ${denoteCount} denote files`);
              console.log('\nConversion complete!');
            }
          }
        });
      });
    },
    error: function(error) {
      console.error('Error parsing CSV:', error);
      process.exit(1);
    }
  });
});