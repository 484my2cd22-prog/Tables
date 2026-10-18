/**
 * Time Tracker Table — Автоматическая система учёта времени для Obsidian
 * Работает полностью локально (без внешних серверов и платных API).
 * Поддерживает ПК, Mac, iPad (iPadOS) и iPhone.
 */

'use strict';

const MONTH_NAMES = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"
];

/**
 * Безопасное преобразование ввода часов или минут в неотрицательное целое число.
 * @param {string|number} value
 * @returns {number}
 */
function parseNonNegativeInt(value) {
  if (value === null || value === undefined || value === "") return 0;
  const cleaned = String(value).trim().replace(/[^0-9-]/g, "");
  const parsed = parseInt(cleaned, 10);
  if (Number.isNaN(parsed) || parsed < 0) return 0;
  return parsed;
}

/**
 * Автоматическое определение названия месяца по строке даты (например, "01.01" -> "Январь", "15.02" -> "Февраль").
 * @param {string} dateStr
 * @param {string} [fallbackMonth]
 * @returns {string}
 */
function detectMonthFromDate(dateStr, fallbackMonth) {
  const s = String(dateStr || "").trim();
  // Формат ДД.ММ или ДД.ММ.ГГГГ или ДД/ММ
  const dmyMatch = s.match(/^(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?$/);
  if (dmyMatch) {
    const monthNum = parseInt(dmyMatch[2], 10);
    if (monthNum >= 1 && monthNum <= 12) {
      return MONTH_NAMES[monthNum - 1];
    }
  }
  // Формат ГГГГ-ММ-ДД
  const isoMatch = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const monthNum = parseInt(isoMatch[2], 10);
    if (monthNum >= 1 && monthNum <= 12) {
      return MONTH_NAMES[monthNum - 1];
    }
  }
  if (fallbackMonth && MONTH_NAMES.includes(fallbackMonth)) {
    return fallbackMonth;
  }
  return fallbackMonth || MONTH_NAMES[0];
}

/**
 * Расчёт продолжительности одной записи в минутах: Часы * 60 + Минуты.
 * При этом если в поле минут введено >= 60, общее число минут считается корректно,
 * а нормализованные часы и минуты возвращаются без ошибки "4 часа 65 минут".
 * @param {number|string} hours
 * @param {number|string} minutes
 * @returns {{ hours: number, minutes: number, normalizedHours: number, normalizedMinutes: number, totalMinutes: number }}
 */
function calculateEntryDuration(hours, minutes) {
  const h = parseNonNegativeInt(hours);
  const m = parseNonNegativeInt(minutes);
  const totalMinutes = h * 60 + m;
  const normalizedHours = Math.floor(totalMinutes / 60);
  const normalizedMinutes = totalMinutes % 60;
  return {
    hours: h,
    minutes: m,
    normalizedHours,
    normalizedMinutes,
    totalMinutes
  };
}

/**
 * Склонение числительных для человекочитаемого вывода.
 */
function pluralizeRu(num, one, few, many) {
  const n = Math.abs(num) % 100;
  const n1 = n % 10;
  if (n > 10 && n < 20) return many;
  if (n1 > 1 && n1 < 5) return few;
  if (n1 === 1) return one;
  return many;
}

/**
 * Форматирование итогового количества минут в оба требуемых формата:
 * 1) "305 минут"
 * 2) "5 ч 5 мин" (и развёрнутый вариант "5 часов 5 минут")
 * Гарантирует отсутствие некорректного вывода вроде "4 часа 65 минут":
 * остаток минут всегда строго в диапазоне 0..59.
 * @param {number} totalMinutesRaw
 */
function formatTotalTime(totalMinutesRaw) {
  const totalMinutes = Math.max(0, Math.floor(Number(totalMinutesRaw) || 0));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  const minutesLabel = `${totalMinutes} ${pluralizeRu(totalMinutes, "минута", "минуты", "минут")}`;
  // Также формируем точное представление со словом "минут" по образцу из ТЗ ("305 минут")
  const minutesFixedLabel = `${totalMinutes} минут`;
  const shortHoursMinutes = `${hours} ч ${minutes} мин`;
  const longHoursMinutes = `${hours} ${pluralizeRu(hours, "час", "часа", "часов")} ${minutes} ${pluralizeRu(minutes, "минута", "минуты", "минут")}`;

  return {
    totalMinutes,
    hours,
    minutes,
    minutesLabel,
    minutesFixedLabel,
    shortHoursMinutes,
    longHoursMinutes
  };
}

/**
 * Расчёт полных итогов по массиву записей с группировкой по месяцам.
 * @param {Array<{id?: string, month?: string, date: string, hours: number|string, minutes: number|string}>} entries
 */
function computeMonthlyReport(entries) {
  const groupsMap = new Map();
  const normalizedEntries = [];

  (entries || []).forEach((item, idx) => {
    const dateStr = String(item.date || "").trim() || "01.01";
    const resolvedMonth = item.month && String(item.month).trim()
      ? String(item.month).trim()
      : detectMonthFromDate(dateStr, "Январь");
    const calc = calculateEntryDuration(item.hours, item.minutes);

    const record = {
      id: item.id || `row_${idx + 1}`,
      month: resolvedMonth,
      date: dateStr,
      hours: calc.hours,
      minutes: calc.minutes,
      totalMinutes: calc.totalMinutes
    };

    normalizedEntries.push(record);

    if (!groupsMap.has(resolvedMonth)) {
      groupsMap.set(resolvedMonth, []);
    }
    groupsMap.get(resolvedMonth).push(record);
  });

  const months = [];
  let grandTotalMinutes = 0;
  let grandTotalCount = 0;

  for (const [monthName, monthEntries] of groupsMap.entries()) {
    const sumMinutes = monthEntries.reduce((acc, r) => acc + r.totalMinutes, 0);
    const formatted = formatTotalTime(sumMinutes);
    grandTotalMinutes += sumMinutes;
    grandTotalCount += monthEntries.length;

    months.push({
      month: monthName,
      entries: monthEntries,
      entryCount: monthEntries.length,
      totalMinutes: formatted.totalMinutes,
      hours: formatted.hours,
      minutes: formatted.minutes,
      minutesDisplay: formatted.minutesFixedLabel,      // напр. "305 минут"
      hmShortDisplay: formatted.shortHoursMinutes,      // напр. "5 ч 5 мин"
      hmLongDisplay: formatted.longHoursMinutes         // напр. "5 часов 5 минут"
    });
  }

  const grandFormatted = formatTotalTime(grandTotalMinutes);

  return {
    entries: normalizedEntries,
    months,
    grandTotal: {
      entryCount: grandTotalCount,
      totalMinutes: grandFormatted.totalMinutes,
      minutesDisplay: grandFormatted.minutesFixedLabel,
      hmShortDisplay: grandFormatted.shortHoursMinutes,
      hmLongDisplay: grandFormatted.longHoursMinutes
    }
  };
}

/**
 * Разбор содержимого блока ```time-tracker в массив записей.
 * Поддерживает как JSON, так и компактный построчный формат:
 * "01.01 | 2 | 30" или "Январь | 01.01 | 2 | 30"
 */
function parseTrackerBlockContent(sourceText) {
  const trimmed = String(sourceText || "").trim();
  if (!trimmed) {
    return getDefaultDemoEntries();
  }

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && Array.isArray(parsed.entries)) return parsed.entries;
    } catch (e) {
      // Если JSON невалиден, пробуем построчный разбор ниже
    }
  }

  const lines = trimmed.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith("#") && !l.startsWith("//"));
  const result = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/^\||\|$/g, "").trim();
    if (!line || /^[-:|\s]+$/.test(line)) continue;
    const parts = line.split(/[|;,]/).map(p => p.trim());
    // Пропускаем строку заголовка, если она есть
    if (parts[0] && /месяц|дата/i.test(parts[0])) continue;

    if (parts.length === 3) {
      const [date, hours, minutes] = parts;
      result.push({
        id: `row_${i + 1}`,
        month: detectMonthFromDate(date, "Январь"),
        date,
        hours: parseNonNegativeInt(hours),
        minutes: parseNonNegativeInt(minutes)
      });
    } else if (parts.length >= 4) {
      const [month, date, hours, minutes] = parts;
      result.push({
        id: `row_${i + 1}`,
        month: month || detectMonthFromDate(date, "Январь"),
        date,
        hours: parseNonNegativeInt(hours),
        minutes: parseNonNegativeInt(minutes)
      });
    }
  }

  return result.length > 0 ? result : getDefaultDemoEntries();
}

/**
 * Сериализация записей обратно в блок заметки Obsidian (чистый, читаемый JSON).
 */
function serializeTrackerBlockContent(entries) {
  const clean = (entries || []).map(e => ({
    month: e.month || detectMonthFromDate(e.date, "Январь"),
    date: String(e.date || "01.01").trim(),
    hours: parseNonNegativeInt(e.hours),
    minutes: parseNonNegativeInt(e.minutes)
  }));
  return JSON.stringify({ entries: clean }, null, 2);
}

/**
 * Генерация готовой статической Markdown-таблицы со всеми расчётами и помесячными итогами
 * (для экспорта или вставки в заметку).
 */
function generateMarkdownTablesReport(entries) {
  const report = computeMonthlyReport(entries);
  const lines = [];

  for (const m of report.months) {
    lines.push(`### ${m.month}`);
    lines.push("");
    lines.push("| Месяц | Дата | Часы | Минуты | Всего минут за запись |");
    lines.push("| :--- | :--- | ---: | ---: | ---: |");
    for (const r of m.entries) {
      lines.push(`| ${r.month} | ${r.date} | ${r.hours} | ${r.minutes} | **${r.totalMinutes}** |`);
    }
    lines.push("");
    lines.push(`- **Общее количество минут за месяц:** ${m.minutesDisplay}`);
    lines.push(`- **Общее время за месяц (часы и минуты):** ${m.hmShortDisplay} (${m.hmLongDisplay})`);
    lines.push(`- **Количество внесённых записей:** ${m.entryCount}`);
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Стартовый набор демонстрационных записей (включает контрольный пример из ТЗ: 150 + 105 + 50 = 305 минут / 5 ч 5 мин).
 */
function getDefaultDemoEntries() {
  return [
    { month: "Январь", date: "01.01", hours: 2, minutes: 30 },
    { month: "Январь", date: "02.01", hours: 1, minutes: 45 },
    { month: "Январь", date: "03.01", hours: 0, minutes: 50 },
    { month: "Февраль", date: "01.02", hours: 3, minutes: 15 },
    { month: "Февраль", date: "04.02", hours: 1, minutes: 55 }
  ];
}

// ============================================================================
// Интеграция с Obsidian API (если код запущен внутри приложения Obsidian)
// ============================================================================
let ObsidianPluginClass = null;

try {
  const obsidian = require("obsidian");
  const { Plugin, Notice } = obsidian;

  class TimeTrackerTablePlugin extends Plugin {
    async onload() {
      this.savedStore = (await this.loadData()) || { backupsByFile: {} };

      // Регистрируем обработчик блока ```time-tracker
      this.registerMarkdownCodeBlockProcessor("time-tracker", (source, el, ctx) => {
        this.renderTimeTrackerWidget(source, el, ctx);
      });

      // Иконка на левой панели для быстрого запуска на iPad одним касанием
      this.addRibbonIcon("clock", "Вставить таблицу учёта времени", async () => {
        await this.insertTrackerIntoActiveNote();
      });

      // Команда в палитре команд Obsidian
      this.addCommand({
        id: "insert-time-tracker-table",
        name: "Вставить интерактивную таблицу учёта времени",
        editorCallback: (editor) => {
          const block = "```time-tracker\n" + serializeTrackerBlockContent(getDefaultDemoEntries()) + "\n```\n";
          editor.replaceSelection(block);
        }
      });

      this.addCommand({
        id: "export-time-tracker-markdown",
        name: "Экспортировать отчёт учёта времени в Markdown-таблицу",
        editorCallback: (editor) => {
          const mdReport = generateMarkdownTablesReport(getDefaultDemoEntries());
          editor.replaceSelection(mdReport);
        }
      });
    }

    async insertTrackerIntoActiveNote() {
      const activeFile = this.app.workspace.getActiveFile();
      const block = "\n```time-tracker\n" + serializeTrackerBlockContent(getDefaultDemoEntries()) + "\n```\n";
      if (activeFile) {
        await this.app.vault.append(activeFile, block);
        new Notice("Таблица учёта времени добавлена в заметку");
      } else {
        const newPath = "Учёт времени.md";
        const existing = this.app.vault.getAbstractFileByPath(newPath);
        if (!existing) {
          const created = await this.app.vault.create(newPath, "# Учёт времени\n" + block);
          await this.app.workspace.getLeaf(false).openFile(created);
        } else {
          await this.app.workspace.getLeaf(false).openFile(existing);
        }
      }
    }

    async persistEntries(entries, el, ctx, statusEl) {
      const serialized = serializeTrackerBlockContent(entries);

      // 1. Сохраняем резервную копию в data.json плагина
      const sourcePath = (ctx && ctx.sourcePath) ? ctx.sourcePath : "default";
      if (!this.savedStore.backupsByFile) {
        this.savedStore.backupsByFile = {};
      }
      this.savedStore.backupsByFile[sourcePath] = entries;
      await this.saveData(this.savedStore);

      // 2. Сохраняем непосредственно в Markdown-заметку через Vault API
      if (ctx && ctx.sourcePath) {
        const abstractFile = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
        if (abstractFile) {
          const sectionInfo = ctx.getSectionInfo ? ctx.getSectionInfo(el) : null;
          await this.app.vault.process(abstractFile, (fileText) => {
            if (sectionInfo && typeof sectionInfo.lineStart === "number" && typeof sectionInfo.lineEnd === "number") {
              const lines = fileText.split(/\r?\n/);
              const openFence = lines[sectionInfo.lineStart] || "```time-tracker";
              const closeFence = lines[sectionInfo.lineEnd] || "```";
              const replacement = [openFence, serialized, closeFence];
              lines.splice(sectionInfo.lineStart, sectionInfo.lineEnd - sectionInfo.lineStart + 1, ...replacement);
              return lines.join("\n");
            }
            // Fallback: заменяем первый блок ```time-tracker ... ```
            const regex = /```time-tracker[\s\S]*?```/;
            if (regex.test(fileText)) {
              return fileText.replace(regex, "```time-tracker\n" + serialized + "\n```");
            }
            return fileText;
          });
        }
      }

      if (statusEl) {
        statusEl.textContent = "✓ Сохранено локально";
        statusEl.classList.add("is-saved");
      }
    }

    renderTimeTrackerWidget(source, el, ctx) {
      el.empty();
      const container = el.createDiv({ cls: "ott-container" });

      let entries = parseTrackerBlockContent(source).map((item, idx) => ({
        id: item.id || `row_${Date.now()}_${idx}`,
        month: item.month || detectMonthFromDate(item.date, "Январь"),
        date: String(item.date || "01.01").trim(),
        hours: parseNonNegativeInt(item.hours),
        minutes: parseNonNegativeInt(item.minutes)
      }));

      // Шапка виджета
      const header = container.createDiv({ cls: "ott-header" });
      header.createDiv({ cls: "ott-title", text: "⏱ Учёт потраченного времени" });
      const statusEl = header.createDiv({ cls: "ott-status is-saved", text: "✓ Автосохранение активно" });

      // Панель быстрого ввода новой записи (только Дата, Часы, Минуты + опционально Месяц)
      const quickAdd = container.createDiv({ cls: "ott-quick-add" });

      // Поле: Дата
      const dateGroup = quickAdd.createDiv({ cls: "ott-field-group" });
      dateGroup.createDiv({ cls: "ott-field-label", text: "Дата (ДД.ММ)" });
      const newDateInput = dateGroup.createEl("input", {
        cls: "ott-input",
        attr: { type: "text", placeholder: "01.01", value: "" }
      });

      // Поле: Часы
      const hoursGroup = quickAdd.createDiv({ cls: "ott-field-group" });
      hoursGroup.createDiv({ cls: "ott-field-label", text: "Часы" });
      const newHoursInput = hoursGroup.createEl("input", {
        cls: "ott-input ott-input-num",
        attr: { type: "number", min: "0", step: "1", inputmode: "numeric", placeholder: "0", value: "" }
      });

      // Поле: Минуты
      const minsGroup = quickAdd.createDiv({ cls: "ott-field-group" });
      minsGroup.createDiv({ cls: "ott-field-label", text: "Минуты" });
      const newMinsInput = minsGroup.createEl("input", {
        cls: "ott-input ott-input-num",
        attr: { type: "number", min: "0", step: "1", inputmode: "numeric", placeholder: "0", value: "" }
      });

      // Поле: Месяц (определяется автоматически по дате ДД.ММ, но можно выбрать вручную)
      const monthGroup = quickAdd.createDiv({ cls: "ott-field-group" });
      monthGroup.createDiv({ cls: "ott-field-label", text: "Месяц (авто)" });
      const newMonthSelect = monthGroup.createEl("select", { cls: "ott-select" });
      MONTH_NAMES.forEach((mName) => {
        newMonthSelect.createEl("option", { text: mName, value: mName });
      });

      // При вводе даты "01.01" автоматически выставляем соответствующий месяц в селекте
      newDateInput.addEventListener("input", () => {
        const detected = detectMonthFromDate(newDateInput.value, newMonthSelect.value);
        newMonthSelect.value = detected;
      });

      // Кнопка добавления записи
      const btnWrap = quickAdd.createDiv({ cls: "ott-field-group ott-btn-add-wrap" });
      const addBtn = btnWrap.createEl("button", {
        cls: "ott-btn ott-btn-primary",
        text: "+ Добавить запись"
      });

      const bodyContainer = container.createDiv({ cls: "ott-body" });

      const rebuildTables = () => {
        bodyContainer.empty();
        const report = computeMonthlyReport(entries);

        report.months.forEach((monthBlock) => {
          const section = bodyContainer.createDiv({ cls: "ott-month-section" });

          const mHeader = section.createDiv({ cls: "ott-month-header" });
          mHeader.createDiv({ cls: "ott-month-title", text: `📅 ${monthBlock.month}` });
          const mBadge = mHeader.createDiv({
            cls: "ott-month-badge",
            text: `${monthBlock.minutesDisplay} • ${monthBlock.hmShortDisplay} • Записей: ${monthBlock.entryCount}`
          });

          const tableWrap = section.createDiv({ cls: "ott-table-wrapper" });
          const table = tableWrap.createEl("table", { cls: "ott-table" });
          const thead = table.createEl("thead");
          const hRow = thead.createEl("tr");
          hRow.createEl("th", { text: "Месяц" });
          hRow.createEl("th", { text: "Дата" });
          hRow.createEl("th", { cls: "is-center", text: "Часы" });
          hRow.createEl("th", { cls: "is-center", text: "Минуты" });
          hRow.createEl("th", { cls: "is-num", text: "Всего минут за запись" });
          hRow.createEl("th", { cls: "is-center", text: "" });

          const tbody = table.createEl("tbody");

          // Ссылки на элементы итогов месяца для мгновенного обновления без потери фокуса клавиатуры iPad
          let summaryMinutesValEl = null;
          let summaryHmValEl = null;
          let summaryCountValEl = null;

          const refreshMonthTotalsInPlace = () => {
            const updatedReport = computeMonthlyReport(entries);
            const currentMonthData = updatedReport.months.find(m => m.month === monthBlock.month);
            if (currentMonthData) {
              if (summaryMinutesValEl) summaryMinutesValEl.textContent = currentMonthData.minutesDisplay;
              if (summaryHmValEl) summaryHmValEl.textContent = currentMonthData.hmShortDisplay;
              if (summaryCountValEl) summaryCountValEl.textContent = String(currentMonthData.entryCount);
              mBadge.textContent = `${currentMonthData.minutesDisplay} • ${currentMonthData.hmShortDisplay} • Записей: ${currentMonthData.entryCount}`;
            }
            if (grandTotalMetricsEl) {
              grandTotalMetricsEl.textContent =
                `Всего: ${updatedReport.grandTotal.minutesDisplay} | ${updatedReport.grandTotal.hmShortDisplay} | Записей: ${updatedReport.grandTotal.entryCount}`;
            }
          };

          monthBlock.entries.forEach((row) => {
            const targetEntry = entries.find(e => e.id === row.id);
            const tr = tbody.createEl("tr");

            // 1. Столбец: Месяц
            const tdMonth = tr.createEl("td");
            const rowMonthSelect = tdMonth.createEl("select", { cls: "ott-select" });
            MONTH_NAMES.forEach((mName) => {
              const opt = rowMonthSelect.createEl("option", { text: mName, value: mName });
              if (mName === row.month) opt.selected = true;
            });

            // 2. Столбец: Дата
            const tdDate = tr.createEl("td");
            const rowDateInput = tdDate.createEl("input", {
              cls: "ott-input",
              attr: { type: "text", value: row.date }
            });

            // 3. Столбец: Часы
            const tdHours = tr.createEl("td", { cls: "is-center" });
            const rowHoursInput = tdHours.createEl("input", {
              cls: "ott-input ott-input-num",
              attr: { type: "number", min: "0", step: "1", inputmode: "numeric", value: String(row.hours) }
            });

            // 4. Столбец: Минуты
            const tdMins = tr.createEl("td", { cls: "is-center" });
            const rowMinsInput = tdMins.createEl("input", {
              cls: "ott-input ott-input-num",
              attr: { type: "number", min: "0", step: "1", inputmode: "numeric", value: String(row.minutes) }
            });

            // 5. Столбец: Всего минут за запись (вычисляется автоматически)
            const tdTotal = tr.createEl("td", {
              cls: "is-num ott-cell-total",
              text: String(row.totalMinutes)
            });

            // 6. Кнопка удаления строки
            const tdAction = tr.createEl("td", { cls: "is-center" });
            const delBtn = tdAction.createEl("button", {
              cls: "ott-btn ott-btn-danger",
              text: "✕",
              attr: { title: "Удалить запись" }
            });

            // Реактивный пересчёт при вводе часов/минут/даты без потери фокуса
            const onRowInput = () => {
              if (!targetEntry) return;
              targetEntry.date = rowDateInput.value.trim() || "01.01";
              const calc = calculateEntryDuration(rowHoursInput.value, rowMinsInput.value);
              targetEntry.hours = calc.hours;
              targetEntry.minutes = calc.minutes;
              tdTotal.textContent = String(calc.totalMinutes);
              refreshMonthTotalsInPlace();
            };

            const onRowCommit = async () => {
              onRowInput();
              // Если дата изменила месяц или пользователь сменил месяц вручную
              await this.persistEntries(entries, el, ctx, statusEl);
            };

            rowDateInput.addEventListener("input", onRowInput);
            rowHoursInput.addEventListener("input", onRowInput);
            rowMinsInput.addEventListener("input", onRowInput);

            rowDateInput.addEventListener("change", async () => {
              if (!targetEntry) return;
              const autoMonth = detectMonthFromDate(rowDateInput.value, targetEntry.month);
              if (autoMonth !== targetEntry.month) {
                targetEntry.month = autoMonth;
                await this.persistEntries(entries, el, ctx, statusEl);
                rebuildTables();
                return;
              }
              await onRowCommit();
            });

            rowHoursInput.addEventListener("change", onRowCommit);
            rowMinsInput.addEventListener("change", onRowCommit);

            rowMonthSelect.addEventListener("change", async () => {
              if (!targetEntry) return;
              targetEntry.month = rowMonthSelect.value;
              await this.persistEntries(entries, el, ctx, statusEl);
              rebuildTables();
            });

            delBtn.addEventListener("click", async () => {
              entries = entries.filter(e => e.id !== row.id);
              await this.persistEntries(entries, el, ctx, statusEl);
              rebuildTables();
            });
          });

          // Карточки автоматических итогов в конце каждого месяца
          const summaryBox = section.createDiv({ cls: "ott-month-summary" });

          const item1 = summaryBox.createDiv({ cls: "ott-summary-item" });
          item1.createDiv({ cls: "ott-summary-label", text: "Общее количество минут за месяц" });
          summaryMinutesValEl = item1.createDiv({
            cls: "ott-summary-value is-accent",
            text: monthBlock.minutesDisplay
          });

          const item2 = summaryBox.createDiv({ cls: "ott-summary-item" });
          item2.createDiv({ cls: "ott-summary-label", text: "Общее время за месяц (часы и минуты)" });
          summaryHmValEl = item2.createDiv({
            cls: "ott-summary-value is-accent",
            text: monthBlock.hmShortDisplay
          });

          const item3 = summaryBox.createDiv({ cls: "ott-summary-item" });
          item3.createDiv({ cls: "ott-summary-label", text: "Количество внесённых записей" });
          summaryCountValEl = item3.createDiv({
            cls: "ott-summary-value",
            text: String(monthBlock.entryCount)
          });
        });

        // Общий сводный блок по всем месяцам
        const grandBar = bodyContainer.createDiv({ cls: "ott-grand-total" });
        grandBar.createDiv({ cls: "ott-grand-total-title", text: "📊 Итого за все месяцы:" });
        var grandTotalMetricsEl = grandBar.createDiv({
          cls: "ott-grand-total-metrics",
          text: `Всего: ${report.grandTotal.minutesDisplay} | ${report.grandTotal.hmShortDisplay} | Записей: ${report.grandTotal.entryCount}`
        });
      };

      // Добавление новой записи по нажатию кнопки
      addBtn.addEventListener("click", async () => {
        const rawDate = newDateInput.value.trim() || "01.01";
        const resolvedMonth = detectMonthFromDate(rawDate, newMonthSelect.value);
        const calc = calculateEntryDuration(newHoursInput.value, newMinsInput.value);

        entries.push({
          id: `row_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          month: resolvedMonth,
          date: rawDate,
          hours: calc.hours,
          minutes: calc.minutes
        });

        newDateInput.value = "";
        newHoursInput.value = "";
        newMinsInput.value = "";

        await this.persistEntries(entries, el, ctx, statusEl);
        rebuildTables();
      });

      rebuildTables();
    }
  }

  ObsidianPluginClass = TimeTrackerTablePlugin;
} catch (err) {
  // Вне среды Obsidian (например, при запуске unit-тестов в Node.js) экспортируем функции ядра
}

if (ObsidianPluginClass) {
  module.exports = ObsidianPluginClass;
  module.exports.calculateEntryDuration = calculateEntryDuration;
  module.exports.formatTotalTime = formatTotalTime;
  module.exports.computeMonthlyReport = computeMonthlyReport;
  module.exports.detectMonthFromDate = detectMonthFromDate;
  module.exports.parseTrackerBlockContent = parseTrackerBlockContent;
  module.exports.serializeTrackerBlockContent = serializeTrackerBlockContent;
  module.exports.generateMarkdownTablesReport = generateMarkdownTablesReport;
} else {
  module.exports = {
    calculateEntryDuration,
    formatTotalTime,
    computeMonthlyReport,
    detectMonthFromDate,
    parseTrackerBlockContent,
    serializeTrackerBlockContent,
    generateMarkdownTablesReport,
    getDefaultDemoEntries
  };
}
