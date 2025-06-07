// popup.js

import { readFileAsText, readFileAsBinary, normalizeText, downloadResults } from './utils.js';
import * as XLSX from 'https://cdn.sheetjs.com/xlsx-0.20.0/package/xlsx.mjs';
import mammoth from "https://cdn.jsdelivr.net/npm/mammoth/mammoth.browser.min.js";

let tabId = null;

chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
  tabId = tabs[0].id;
});

document.getElementById("searchBtn").addEventListener("click", async function () {
  const searchText = document.getElementById("searchInput").value.trim();
  const fileInput = document.getElementById("fileInput");
  const output = document.getElementById("output");
  const foundList = document.getElementById("foundList");
  const notFoundList = document.getElementById("notFoundList");

  output.innerHTML = "<p>Please wait... Processing...</p>";

  let fileLines = [];
  const foundInFile = [];
  const notFoundInFile = [];

  if (fileInput.files.length > 0) {
    const file = fileInput.files[0];
    const fileName = file.name.toLowerCase();

    try {
      if (fileName.endsWith(".csv")) {
        const text = await readFileAsText(file);
        fileLines = text.split("\n").map(line => normalizeText(line)).filter(Boolean);
      } else if (fileName.endsWith(".xlsx")) {
        const data = await readFileAsBinary(file);
        const workbook = XLSX.read(data, { type: "binary" });
        workbook.SheetNames.forEach(sheet => {
          const sheetData = XLSX.utils.sheet_to_json(workbook.Sheets[sheet], { header: 1 });
          sheetData.forEach(row => row.forEach(cell => fileLines.push(normalizeText(cell))));
        });
      } else if (fileName.endsWith(".docx")) {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        fileLines = result.value.split("\n").map(line => normalizeText(line)).filter(Boolean);
      } else {
        throw new Error("Unsupported file type");
      }
    } catch (error) {
      output.innerHTML = `<p class='text-red-500'>Error reading file: ${error.message}</p>`;
      return;
    }
  }

  const searchItems = searchText ? [searchText] : fileLines;

  chrome.scripting.executeScript(
    {
      target: { tabId: tabId },
      function: findAndHighlightText,
      args: [searchItems]
    },
    (results) => {
      const pageText = results[0].result;
      const normalizedPageText = normalizeText(pageText);
      const normalizedPageSet = new Set(normalizedPageText.split(/\s+/));

      const normalizedFileSet = new Set(searchItems.map(normalizeText));

      normalizedFileSet.forEach(item => {
        if (normalizedPageSet.has(item)) {
          foundInFile.push(item);
        } else {
          const isPartialMatch = Array.from(normalizedPageSet).some(pageWord => pageWord.includes(item));
          if (isPartialMatch) {
            foundInFile.push(item);
          } else {
            notFoundInFile.push(item);
          }
        }
      });

      foundList.innerHTML = foundInFile.length > 0 ? foundInFile.map(item => `<li>${item}</li>`).join('') : '<li>No matches found</li>';
      notFoundList.innerHTML = notFoundInFile.length > 0 ? notFoundInFile.map(item => `<li>${item}</li>`).join('') : '<li>All matched</li>';

      output.innerHTML = "<p>Search complete. Results below:</p>";

      if (foundInFile.length > 0) {
        downloadResults("found_results.csv", foundInFile);
      }
      if (notFoundInFile.length > 0) {
        downloadResults("not_found_results.csv", notFoundInFile);
      }
    }
  );
});

function findAndHighlightText(searchItems) {
  const normalize = text => text.toLowerCase().trim();

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  while (walker.nextNode()) {
    textNodes.push(walker.currentNode);
  }

  textNodes.forEach(node => {
    const parent = node.parentNode;
    if (!parent) return;
    const originalText = node.nodeValue;
    let newHTML = originalText;

    searchItems.forEach(item => {
      const normalizedItem = normalize(item);
      const regex = new RegExp(`(\\b${normalizedItem.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\b)`, 'gi');
      newHTML = newHTML.replace(regex, '<mark>$1</mark>');
    });

    if (newHTML !== originalText) {
      const temp = document.createElement("span");
      temp.innerHTML = newHTML;
      parent.replaceChild(temp, node);
    }
  });

  return document.body.innerText;
}

// utils.js
export function normalizeText(text) {
  return text
    .toLowerCase()
    .replace(/[\s\n\r\t]+/g, ' ')
    .replace(/[^\w\s]/g, '')
    .trim();
}

export function downloadResults(filename, data) {
  const blob = new Blob([data.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

export function readFileAsBinary(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsBinaryString(file);
  });
}
document.getElementById("findOnPageBtn").addEventListener("click", function () {
  const searchText = document.getElementById("searchTextInput").value.trim();
  const searchItems = searchText.split("\n").map(t => t.trim()).filter(Boolean);

  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    chrome.tabs.sendMessage(tabs[0].id, {
      type: "highlight",
      terms: searchItems
    }, function (response) {
      console.log(response?.status || "No response from content script");
    });
  });
});
