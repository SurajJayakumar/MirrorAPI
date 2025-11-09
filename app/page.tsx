"use client";
import { useState, useEffect } from "react";
import Image from "next/image";
import { useSession } from "next-auth/react";
import { diffSchemas, type DiffReport } from "@/lib/diff";
import { scoreDiff } from "@/lib/score";
import { downloadCSV, downloadPDF } from "@/lib/export";
import { UserMenu } from "@/components/auth/user-menu";
import { SignInButton } from "@/components/auth/signin-button";
import { useRouter } from "next/navigation";
import { useTheme } from "@/components/theme/theme-provider";
import { ThemeToggle } from "@/components/theme/theme-toggle";

function formatJson(obj: any): string {
  return JSON.stringify(obj, null, 2);
}

// Get highlight class for a path based on diff report
function getHighlightClass(path: string, report: DiffReport | null, isOld: boolean): string {
  if (!report) return "";
  
  const change = report.changes.find(c => (c as any).path === path);
  if (!change) return "";
  
  if (change.kind === "REMOVED_FIELD") {
    return isOld ? "bg-red-100 dark:bg-red-900/30 border-l-4 border-red-600 dark:border-red-500 py-0.5 px-2 -mx-2 my-0.5 rounded-r block" : "";
  }
  if (change.kind === "ADDED_FIELD") {
    return isOld ? "" : "bg-green-100 border-l-4 border-green-600 py-0.5 px-2 -mx-2 my-0.5 rounded-r block";
  }
  if (change.kind === "TYPE_CHANGED") {
    return "bg-amber-100 border-l-4 border-amber-600 py-0.5 px-2 -mx-2 my-0.5 rounded-r block";
  }
  return "";
}

// Check if a path or value matches the search query
function matchesSearch(path: string, value: any, searchQuery: string): boolean {
  if (!searchQuery) return false;
  const query = searchQuery.toLowerCase();
  const pathLower = path.toLowerCase();
  const valueStr = String(value).toLowerCase();
  return pathLower.includes(query) || valueStr.includes(query);
}

// Escape special regex characters
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Highlight text with search matches
function highlightSearchText(text: string, searchQuery: string, theme: "light" | "dark" = "light"): JSX.Element {
  if (!searchQuery) {
    return <span>{text}</span>;
  }
  
  const query = searchQuery.toLowerCase();
  const textLower = text.toLowerCase();
  const parts: JSX.Element[] = [];
  let lastIndex = 0;
  let index = textLower.indexOf(query);
  const highlightBg = theme === "light" ? "bg-yellow-200" : "bg-yellow-600";
  
  while (index !== -1) {
    // Add text before match
    if (index > lastIndex) {
      parts.push(<span key={lastIndex}>{text.substring(lastIndex, index)}</span>);
    }
    // Add highlighted match
    parts.push(
      <span key={index} className={`${highlightBg} font-semibold`}>
        {text.substring(index, index + searchQuery.length)}
      </span>
    );
    lastIndex = index + searchQuery.length;
    index = textLower.indexOf(query, lastIndex);
  }
  
  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(<span key={lastIndex}>{text.substring(lastIndex)}</span>);
  }
  
  return <span>{parts}</span>;
}

// Recursive JSON renderer with highlighting
function renderJsonWithHighlights(
  obj: any, 
  report: DiffReport | null, 
  isOld: boolean, 
  currentPath: string = "", 
  indent: number = 0,
  searchQuery: string = "",
  theme: "light" | "dark" = "light"
): JSX.Element {
  const indentStr = "  ".repeat(indent);
  const hasSearchMatch = matchesSearch(currentPath, obj, searchQuery);
  const searchHighlight = hasSearchMatch ? (theme === "light" ? "bg-yellow-200" : "bg-yellow-600") : "";
  const nullColor = theme === "light" ? "text-gray-500" : "text-gray-400";
  const stringColor = theme === "light" ? "text-green-700" : "text-green-400";
  const numberColor = theme === "light" ? "text-blue-700" : "text-blue-400";
  const booleanColor = theme === "light" ? "text-purple-700" : "text-purple-400";
  const bracketColor = theme === "light" ? "text-gray-900" : "text-gray-200";
  const punctuationColor = theme === "light" ? "text-gray-700" : "text-gray-300";
  
  if (obj === null) {
    const highlight = getHighlightClass(currentPath, report, isOld);
    return <span className={`${highlight} ${searchHighlight} ${nullColor}`}>{highlightSearchText("null", searchQuery, theme)}</span>;
  }
  
  if (typeof obj === "string") {
    const highlight = getHighlightClass(currentPath, report, isOld);
    const jsonStr = JSON.stringify(obj);
    return <span className={`${highlight} ${searchHighlight} ${stringColor}`}>{highlightSearchText(jsonStr, searchQuery, theme)}</span>;
  }
  
  if (typeof obj === "number") {
    const highlight = getHighlightClass(currentPath, report, isOld);
    const str = String(obj);
    return <span className={`${highlight} ${searchHighlight} ${numberColor}`}>{highlightSearchText(str, searchQuery, theme)}</span>;
  }
  
  if (typeof obj === "boolean") {
    const highlight = getHighlightClass(currentPath, report, isOld);
    const str = String(obj);
    return <span className={`${highlight} ${searchHighlight} ${booleanColor}`}>{highlightSearchText(str, searchQuery, theme)}</span>;
  }
  
  if (Array.isArray(obj)) {
    const highlight = getHighlightClass(currentPath, report, isOld);
    if (obj.length === 0) {
      return <span className={`${highlight} ${searchHighlight} ${bracketColor}`}>[]</span>;
    }
    return (
      <>
        <span className={`${highlight} ${searchHighlight} ${bracketColor}`}>[</span>
        <br />
        {obj.map((item, i) => (
          <span key={i}>
            <span>{indentStr}  </span>
            {renderJsonWithHighlights(item, report, isOld, `${currentPath}[${i}]`, indent + 1, searchQuery, theme)}
            {i < obj.length - 1 && <span className={punctuationColor}>,</span>}
            <br />
          </span>
        ))}
        <span>{indentStr}</span>
        <span className={`${highlight} ${searchHighlight} ${bracketColor}`}>]</span>
      </>
    );
  }
  
  if (typeof obj === "object") {
    const keys = Object.keys(obj);
    const highlight = getHighlightClass(currentPath, report, isOld);
    const keyColor = theme === "light" ? "text-[#003478]" : "text-[#76B900]";
    // Check if this object itself has a TYPE_CHANGED (e.g., changed from string to object)
    const hasTypeChange = report?.changes.some(c => (c as any).path === currentPath && c.kind === "TYPE_CHANGED");
    
    if (keys.length === 0) {
      return <span className={`${highlight} ${searchHighlight} ${bracketColor}`}>{`{}`}</span>;
    }
    
    // If this object has a TYPE_CHANGED, wrap the entire object content in the highlight
    // This makes it clear that the entire structure changed
    if (hasTypeChange && highlight) {
      return (
        <span className={`${highlight} ${searchHighlight} block`}>
          <span className={`${highlight} ${searchHighlight} ${bracketColor}`}>{`{`}</span>
          <br />
          {keys.map((key, i) => {
            const keyPath = currentPath ? `${currentPath}.${key}` : key;
            const valueChange = report?.changes.find(c => (c as any).path === keyPath);
            const hasChange = valueChange !== undefined;
            const changeHighlight = hasChange ? getHighlightClass(keyPath, report, isOld) : highlight;
            const keyMatchesSearch = matchesSearch(key, key, searchQuery) || matchesSearch(keyPath, obj[key], searchQuery);
            const keySearchHighlight = keyMatchesSearch ? (theme === "light" ? "bg-yellow-200" : "bg-yellow-600") : "";
            
            return (
              <span key={key} className={`${changeHighlight} ${keySearchHighlight}`}>
                <span>{indentStr}  </span>
                <span className={`${keyColor} font-medium`}>
                  {highlightSearchText(`"${key}"`, searchQuery, theme)}
                </span>
                <span className={punctuationColor}>: </span>
                {renderJsonWithHighlights(obj[key], report, isOld, keyPath, indent + 1, searchQuery, theme)}
                {i < keys.length - 1 && <span className={punctuationColor}>,</span>}
                <br />
              </span>
            );
          })}
          <span>{indentStr}</span>
          <span className={`${highlight} ${searchHighlight} ${bracketColor}`}>{`}`}</span>
        </span>
      );
    }
    
    // Normal rendering when no TYPE_CHANGED at this level
    return (
      <>
        <span className={`${highlight} ${searchHighlight} ${bracketColor}`}>{`{`}</span>
        <br />
        {keys.map((key, i) => {
          const keyPath = currentPath ? `${currentPath}.${key}` : key;
          const valueChange = report?.changes.find(c => (c as any).path === keyPath);
          const hasChange = valueChange !== undefined;
          const changeHighlight = hasChange ? getHighlightClass(keyPath, report, isOld) : "";
          const keyMatchesSearch = matchesSearch(key, key, searchQuery) || matchesSearch(keyPath, obj[key], searchQuery);
          const keySearchHighlight = keyMatchesSearch ? (theme === "light" ? "bg-yellow-200" : "bg-yellow-600") : "";
          
          // Wrap the entire key-value pair in highlight if there's a change or search match
          return (
            <span key={key} className={`${hasChange ? changeHighlight : ""} ${keySearchHighlight}`}>
              <span>{indentStr}  </span>
              <span className={`${keyColor} font-medium`}>
                {highlightSearchText(`"${key}"`, searchQuery, theme)}
              </span>
              <span className={punctuationColor}>: </span>
              {renderJsonWithHighlights(obj[key], report, isOld, keyPath, indent + 1, searchQuery, theme)}
              {i < keys.length - 1 && <span className={punctuationColor}>,</span>}
              <br />
            </span>
          );
        })}
        <span>{indentStr}</span>
        <span className={`${highlight} ${searchHighlight} ${bracketColor}`}>{`}`}</span>
      </>
    );
  }
  
  return <span>{String(obj)}</span>;
}

// Simple markdown renderer for AI explanation
function renderMarkdown(text: string): JSX.Element {
  if (!text) return <></>;
  
  const lines = text.split('\n');
  const elements: JSX.Element[] = [];
  let currentParagraph: string[] = [];
  let inCodeBlock = false;
  let codeBlockLang = '';
  let codeBlockContent: string[] = [];
  let inList = false;
  let listItems: string[] = [];
  
  const processParagraph = () => {
    if (currentParagraph.length > 0) {
      const paraText = currentParagraph.join(' ').trim();
      if (paraText) {
        elements.push(
          <p key={elements.length} className="mb-3 last:mb-0">
            {renderInlineMarkdown(paraText)}
          </p>
        );
      }
      currentParagraph = [];
    }
  };
  
  const processList = () => {
    if (listItems.length > 0) {
      elements.push(
        <ul key={elements.length} className="list-disc list-inside mb-3 space-y-1 ml-4">
          {listItems.map((item, idx) => (
            <li key={idx} className="ml-2">
              {renderInlineMarkdown(item.trim().replace(/^[-*+]\s+/, ''))}
            </li>
          ))}
        </ul>
      );
      listItems = [];
      inList = false;
    }
  };
  
  const processCodeBlock = () => {
    if (codeBlockContent.length > 0) {
      elements.push(
        <pre key={elements.length} className="bg-gray-900 text-gray-100 p-3 rounded-lg overflow-x-auto mb-3 text-xs font-mono border border-gray-700">
          <code className="text-gray-100">{codeBlockContent.join('\n')}</code>
        </pre>
      );
      codeBlockContent = [];
      inCodeBlock = false;
      codeBlockLang = '';
    }
  };
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    // Code blocks
    if (trimmed.startsWith('```')) {
      if (inCodeBlock) {
        processCodeBlock();
      } else {
        processParagraph();
        processList();
        codeBlockLang = trimmed.substring(3).trim();
        inCodeBlock = true;
      }
      continue;
    }
    
    if (inCodeBlock) {
      codeBlockContent.push(line);
      continue;
    }
    
    // Headers
    if (trimmed.match(/^#{1,6}\s+/)) {
      processParagraph();
      processList();
      const level = trimmed.match(/^#+/)?.[0].length || 1;
      const text = trimmed.replace(/^#+\s+/, '');
      const HeaderTag = `h${Math.min(level, 6)}` as keyof JSX.IntrinsicElements;
      const className = level === 1 ? 'text-xl font-bold mb-2 mt-4' :
                       level === 2 ? 'text-lg font-bold mb-2 mt-4' :
                       level === 3 ? 'text-base font-semibold mb-2 mt-3' :
                       'text-sm font-semibold mb-1 mt-2';
      elements.push(
        <HeaderTag key={elements.length} className={className}>
          {renderInlineMarkdown(text)}
        </HeaderTag>
      );
      continue;
    }
    
    // List items
    if (trimmed.match(/^[-*+]\s+/)) {
      if (!inList) {
        processParagraph();
        inList = true;
      }
      listItems.push(trimmed);
      continue;
    } else if (inList) {
      processList();
    }
    
    // Horizontal rule
    if (trimmed.match(/^[-*_]{3,}$/)) {
      processParagraph();
      processList();
      elements.push(<hr key={elements.length} className="my-4 border-gray-300" />);
      continue;
    }
    
    // Empty line
    if (trimmed === '') {
      processParagraph();
      processList();
      continue;
    }
    
    // Regular paragraph text
    currentParagraph.push(line);
  }
  
  // Process remaining content
  processParagraph();
  processList();
  processCodeBlock();
  
  return <div>{elements}</div>;
}

// Render inline markdown (bold, italic, code, links)
function renderInlineMarkdown(text: string): (string | JSX.Element)[] {
  const parts: (string | JSX.Element)[] = [];
  
  // Process text character by character to handle nested/overlapping patterns
  // We'll process in order: code blocks (highest priority), links, bold, italic
  
  // First, find all code spans (highest priority - they can't contain other markdown)
  const codeMatches: Array<{start: number, end: number, content: string}> = [];
  const codePattern = /`([^`]+)`/g;
  let match;
  while ((match = codePattern.exec(text)) !== null) {
    codeMatches.push({
      start: match.index,
      end: match.index + match[0].length,
      content: match[1]
    });
  }
  
  // Then find all bold patterns (**text** or __text__)
  const boldMatches: Array<{start: number, end: number, content: string}> = [];
  const boldPattern = /(\*\*|__)(.+?)\1/g;
  while ((match = boldPattern.exec(text)) !== null) {
    // Check if this bold match overlaps with any code match
    const overlapsCode = codeMatches.some(cm => 
      (match!.index < cm.end && match!.index + match![0].length > cm.start)
    );
    if (!overlapsCode) {
      boldMatches.push({
        start: match.index,
        end: match.index + match[0].length,
        content: match[2]
      });
    }
  }
  
  // Find all links [text](url)
  const linkMatches: Array<{start: number, end: number, content: string, url: string}> = [];
  const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
  while ((match = linkPattern.exec(text)) !== null) {
    const overlapsCode = codeMatches.some(cm => 
      (match!.index < cm.end && match!.index + match![0].length > cm.start)
    );
    if (!overlapsCode) {
      linkMatches.push({
        start: match.index,
        end: match.index + match[0].length,
        content: match[1],
        url: match[2]
      });
    }
  }
  
  // Find italic patterns (*text* or _text_) - but avoid overlapping with bold or code
  const italicMatches: Array<{start: number, end: number, content: string}> = [];
  // Use a simple approach: find single * or _ that aren't part of ** or __
  let i = 0;
  while (i < text.length) {
    if (text[i] === '*' && i + 1 < text.length && text[i + 1] !== '*') {
      // Potential italic start with *
      const endIdx = text.indexOf('*', i + 1);
      if (endIdx > i + 1 && (endIdx + 1 >= text.length || text[endIdx + 1] !== '*')) {
        const content = text.substring(i + 1, endIdx);
        const overlapsCode = codeMatches.some(cm => i < cm.end && endIdx + 1 > cm.start);
        const overlapsBold = boldMatches.some(bm => i < bm.end && endIdx + 1 > bm.start);
        const overlapsLink = linkMatches.some(lm => i < lm.end && endIdx + 1 > lm.start);
        if (!overlapsCode && !overlapsBold && !overlapsLink && content.length > 0) {
          italicMatches.push({
            start: i,
            end: endIdx + 1,
            content: content
          });
          i = endIdx + 1;
          continue;
        }
      }
    } else if (text[i] === '_' && i + 1 < text.length && text[i + 1] !== '_') {
      // Potential italic start with _
      const endIdx = text.indexOf('_', i + 1);
      if (endIdx > i + 1 && (endIdx + 1 >= text.length || text[endIdx + 1] !== '_')) {
        const content = text.substring(i + 1, endIdx);
        const overlapsCode = codeMatches.some(cm => i < cm.end && endIdx + 1 > cm.start);
        const overlapsBold = boldMatches.some(bm => i < bm.end && endIdx + 1 > bm.start);
        const overlapsLink = linkMatches.some(lm => i < lm.end && endIdx + 1 > lm.start);
        if (!overlapsCode && !overlapsBold && !overlapsLink && content.length > 0) {
          italicMatches.push({
            start: i,
            end: endIdx + 1,
            content: content
          });
          i = endIdx + 1;
          continue;
        }
      }
    }
    i++;
  }
  
  // Combine all matches and sort by start position
  const allMatches: Array<{start: number, end: number, type: string, content: string, url?: string}> = [
    ...codeMatches.map(m => ({...m, type: 'code' as const})),
    ...linkMatches.map(m => ({...m, type: 'link' as const, url: m.url})),
    ...boldMatches.map(m => ({...m, type: 'bold' as const})),
    ...italicMatches.map(m => ({...m, type: 'italic' as const}))
  ];
  
  // Sort by start position, and if same start, prioritize: code > link > bold > italic
  const priority: Record<string, number> = { code: 4, link: 3, bold: 2, italic: 1 };
  allMatches.sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    return (priority[b.type] || 0) - (priority[a.type] || 0);
  });
  
  // Remove overlapping matches (keep higher priority)
  const filteredMatches: typeof allMatches = [];
  for (const match of allMatches) {
    const overlaps = filteredMatches.some(m => 
      (match.start < m.end && match.end > m.start)
    );
    if (!overlaps) {
      filteredMatches.push(match);
    }
  }
  
  // Build parts array
  let currentIndex = 0;
  for (const match of filteredMatches) {
    // Add text before match
    if (match.start > currentIndex) {
      parts.push(text.substring(currentIndex, match.start));
    }
    
    // Add matched element
    const key = `${match.type}-${match.start}`;
    switch (match.type) {
      case 'bold':
        parts.push(<strong key={key} className="font-bold">{match.content}</strong>);
        break;
      case 'italic':
        parts.push(<em key={key} className="italic">{match.content}</em>);
        break;
      case 'code':
        parts.push(<code key={key} className="bg-blue-100 text-blue-900 px-1.5 py-0.5 rounded text-xs font-mono border border-blue-200">{match.content}</code>);
        break;
      case 'link':
        parts.push(
          <a 
            key={key} 
            href={match.url} 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-blue-900 hover:text-blue-700 underline font-medium"
          >
            {match.content}
          </a>
        );
        break;
    }
    
    currentIndex = match.end;
  }
  
  // Add remaining text
  if (currentIndex < text.length) {
    parts.push(text.substring(currentIndex));
  }
  
  // If no matches, return the text as-is
  if (parts.length === 0) {
    return [text];
  }
  
  return parts;
}

export default function Page() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { theme } = useTheme();
  const [oldUrl,setOldUrl]=useState(""); const [newUrl,setNewUrl]=useState("");
  const [oldFile,setOldFile]=useState<File|null>(null); const [newFile,setNewFile]=useState<File|null>(null);
  const [oldJson,setOldJson]=useState<any>(null); const [newJson,setNewJson]=useState<any>(null);
  const [report,setReport]=useState<DiffReport|null>(null); const [score,setScore]=useState<number| null>(null);
  const [loading,setLoading]=useState(false); const [error,setError]=useState<string| null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedChangeType, setSelectedChangeType] = useState<"ALL" | "REMOVED_FIELD" | "ADDED_FIELD" | "TYPE_CHANGED">("ALL");
  const [schemaSearchQuery, setSchemaSearchQuery] = useState("");
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [ragOutput, setRagOutput] = useState<string | null>(null);
  const [ragLoading, setRagLoading] = useState(false);
  const [ragError, setRagError] = useState<string | null>(null);

  const loadJsonFromFile = async (f:File)=>JSON.parse(await f.text());
  const loadJsonFromUrl = async (url:string)=>{ const r=await fetch(`/api/fetch?url=${encodeURIComponent(url)}`); if(!r.ok) throw new Error(`Fetch ${r.status}`); return r.json(); };

  async function analyze(){
    setError(null); setLoading(true);
    try{
      const old = oldFile ? await loadJsonFromFile(oldFile) : oldUrl ? await loadJsonFromUrl(oldUrl) : null;
      const new_ = newFile ? await loadJsonFromFile(newFile) : newUrl ? await loadJsonFromUrl(newUrl) : null;
      if(!old||!new_) throw new Error("Provide both OLD and NEW (file or URL).");
      setOldJson(old); setNewJson(new_);
      const diff = diffSchemas(old,new_); const s = scoreDiff(diff);
      setReport(diff); setScore(s);
      // Reset filters when new analysis is performed
      setSearchQuery("");
      setSelectedChangeType("ALL");
      setSchemaSearchQuery("");
      setCurrentPage(1);
      setItemsPerPage(10);
    }catch(e:any){ setError(e.message||"Analysis failed"); } finally{ setLoading(false); }
  }

  function loadSamples(){ 
    setOldUrl("/samples/v1.json"); setNewUrl("/samples/v2.json"); 
    setRagOutput(null);
    setRagError(null);
    setRagLoading(false);
  }

  // Format diff report as text for RAG ingestion
  function formatDiffReportForRAG(report: DiffReport | null): string {
    if (!report) return "";
    
    let text = "API Schema Migration Changes Report\n";
    text += "=====================================\n\n";
    text += `Summary:\n`;
    text += `- Added Fields: ${report.summary.added}\n`;
    text += `- Removed Fields: ${report.summary.removed}\n`;
    text += `- Risky Changes: ${report.summary.risky}\n\n`;
    text += `Detailed Changes:\n`;
    text += "================\n\n";
    
    report.changes.forEach((change, idx) => {
      text += `${idx + 1}. `;
      if (change.kind === "REMOVED_FIELD") {
        text += `REMOVED: Field "${change.path}" (type: ${change.oldType}) was removed from the API.\n`;
      } else if (change.kind === "ADDED_FIELD") {
        text += `ADDED: Field "${change.path}" (type: ${change.newType}) was added to the API.\n`;
      } else if (change.kind === "TYPE_CHANGED") {
        text += `TYPE CHANGED: Field "${change.path}" changed from ${change.oldType} to ${change.newType}.\n`;
      }
      text += "\n";
    });
    
    return text;
  }

  // Analyze changes with RAG
  async function analyzeWithRAG() {
    if (!report || !oldJson || !newJson) {
      setRagError("No diff report available. Please run analysis first.");
      return;
    }

    setRagLoading(true);
    setRagError(null);
    setRagOutput(null);

    try {
      // Format changes for the generate endpoint
      const changes = report.changes.map((change: any) => ({
        path: change.path,
        kind: change.kind,
        oldType: change.oldType || null,
        newType: change.newType || null,
      }));

      // Step 1: Ingest the diff report (optional, for RAG context)
      const diffText = formatDiffReportForRAG(report);
      try {
        const ingestResponse = await fetch("/api/rag", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "ingest",
            data: {
              text: diffText,
            },
          }),
        });
        // Don't fail if ingestion fails, continue with generate
        await ingestResponse.json();
      } catch (e) {
        console.warn("Ingestion failed, continuing with generate:", e);
      }

      // Step 2: Generate insights using the generate endpoint
      const generateResponse = await fetch("/api/rag", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "generate",
          data: {
            changes: changes,
            old_schema: oldJson,
            new_schema: newJson,
            query: "Analyze these API changes and explain WHY the API was changed from v1 to v2. Focus on the business logic, data modeling improvements, or technical reasons behind each change. Use the field names, types, and actual values to provide insights.",
            max_new_tokens: 600,
            temperature: 0.3,
          },
        }),
      });

      const generateResult = await generateResponse.json();
      if (!generateResult.ok) {
        throw new Error(generateResult.msg || "Generation failed");
      }

      setRagOutput(generateResult.answer || "No response from AI system.");
    } catch (e: any) {
      setRagError(e.message || "RAG analysis failed");
    } finally {
      setRagLoading(false);
    }
  }

  // Adjust current page when filters change and page is out of bounds
  useEffect(() => {
    if (!report) return;
    
    const filteredChanges = report.changes.filter((c) => {
      if (selectedChangeType !== "ALL" && c.kind !== selectedChangeType) {
        return false;
      }
      if (searchQuery && !(c as any).path.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
      return true;
    });

    const totalPages = Math.ceil(filteredChanges.length / itemsPerPage);
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(1);
    }
  }, [report, selectedChangeType, searchQuery, itemsPerPage, currentPage]);
  
  function loadSampleFromAPI() {
    setError(null);
    setRagOutput(null);
    setRagError(null);
    setRagLoading(false);
    // Use real API endpoints - GitHub API is a good example
    // These will show schema differences when analyzed
    const sampleApiUrl1 = "https://api.github.com/users/octocat";
    const sampleApiUrl2 = "https://api.github.com/users/github";
    
    // Just set the URLs - don't fetch or analyze yet
    // User will click "Analyze APIs" button to fetch and show the preview
    setOldUrl(sampleApiUrl1);
    setNewUrl(sampleApiUrl2);
    
    // Clear previous results so user can see fresh analysis
    setOldJson(null);
    setNewJson(null);
    setReport(null);
    setScore(null);
  }

  // Theme colors
  const primaryColor = theme === "light" ? "#D62311" : "#76B900"; // StateFarm red : NVIDIA green
  const primaryDarkColor = theme === "light" ? "#B41D0E" : "#5A8F00"; // Darker red : Darker green
  const bgColor = theme === "light" ? "bg-white" : "bg-black";
  const headerBgColor = theme === "light" ? "bg-[#D62311]" : "bg-[#76B900]";
  const textColor = theme === "light" ? "text-gray-900" : "text-gray-100";
  const cardBgColor = theme === "light" ? "bg-white" : "bg-gray-900";
  const borderColor = theme === "light" ? "border-gray-200" : "border-gray-800";
  const inputBgColor = theme === "light" ? "bg-white" : "bg-gray-800";
  const mutedBgColor = theme === "light" ? "bg-gray-50" : "bg-gray-950";
  const mutedTextColor = theme === "light" ? "text-gray-700" : "text-gray-300";
  // JSON preview specific colors for better readability
  const jsonBgColor = theme === "light" ? "bg-gray-50" : "bg-gray-800";
  const jsonTextColor = theme === "light" ? "text-gray-900" : "text-gray-100";
  const jsonKeyColor = theme === "light" ? "text-[#003478]" : "text-[#76B900]";
  const jsonStringColor = theme === "light" ? "text-green-700" : "text-green-400";
  const jsonNumberColor = theme === "light" ? "text-blue-700" : "text-blue-400";
  const jsonBooleanColor = theme === "light" ? "text-purple-700" : "text-purple-400";
  const jsonNullColor = theme === "light" ? "text-gray-500" : "text-gray-400";
  const searchHighlightBg = theme === "light" ? "bg-yellow-200" : "bg-yellow-600";

  return (
    <div className={`min-h-screen ${bgColor} transition-colors`}>
      {/* Header Bar - StateFarm red (light) or NVIDIA green (dark) */}
      <header className={`${headerBgColor} text-white shadow-md transition-colors`}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Image 
                src={theme === "light" ? "/samples/logo.png" : "/samples/nvidia.png"} 
                alt={theme === "light" ? "State Farm Logo" : "NVIDIA Logo"} 
                width={40} 
                height={40}
                className="object-contain cursor-pointer transition-opacity"
                onClick={() => router.push('/')}
              />
              <button
                onClick={() => router.push('/')}
                className="text-xl font-bold hover:opacity-80 transition-opacity cursor-pointer"
              >
                MirrorAPI
              </button>
            </div>
            <div className="flex items-center gap-6">
              <button 
                onClick={loadSamples}
                className="text-sm hover:underline"
              >
                Load Samples
              </button>
              <button 
                onClick={loadSampleFromAPI}
                className="text-sm hover:underline"
              >
                Load Sample from API
              </button>
              <ThemeToggle />
              {status === "loading" ? (
                <div className="text-sm">Loading...</div>
              ) : session ? (
                <UserMenu />
              ) : (
                <button
                  onClick={() => router.push("/auth/signin")}
                  className={`px-4 py-2 bg-white ${theme === "light" ? "text-[#D62311]" : "text-[#76B900]"} rounded-lg font-medium hover:bg-gray-100 transition-colors`}
                >
                  Sign In
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area - Two Column Layout */}
      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Main Heading */}
            <div>
              <h2 className={`text-4xl font-bold mb-2 ${theme === "light" ? "text-[#D62311]" : "text-[#76B900]"} transition-colors`}>API Schema Migration Analysis</h2>
              <h3 className={`text-3xl font-bold mb-4 ${textColor} transition-colors`}>Compare Your API Versions with Confidence</h3>
              <p className={`text-base leading-relaxed mb-4 ${mutedTextColor} transition-colors`}>
                Analyze and compare API schema changes to identify breaking changes, new fields, and migration risks. 
                Get detailed insights into what's changed between API versions and understand the impact on your integration.
              </p>
              <p className={`text-base leading-relaxed ${mutedTextColor} transition-colors`}>
                Our migration analysis tool helps you understand schema differences, assess migration risks, and plan your API updates effectively.
              </p>
            </div>

            {/* Results Section - Only show when we have results */}
            {oldJson && newJson && (
              <div className="space-y-6">
                <div>
                  <h4 className={`text-2xl font-bold mb-3 ${theme === "light" ? "text-[#D62311]" : "text-[#76B900]"} transition-colors`}>Schema Comparison</h4>
                  <p className={`text-base mb-4 ${mutedTextColor} transition-colors`}>Side-by-side comparison of your API schemas</p>
                </div>
                
                <div className={`${cardBgColor} border ${borderColor} rounded-lg overflow-hidden transition-colors`}>
                  <div className={`p-4 border-b ${borderColor} ${mutedBgColor} space-y-4 transition-colors`}>
                    <div className="flex items-center justify-between flex-wrap gap-4">
                      <h5 className={`text-lg font-semibold ${textColor} transition-colors`}>JSON Schema Preview</h5>
                      {report && (
                        <div className="flex flex-wrap gap-4 text-xs">
                          <div className="flex items-center gap-2">
                            <span className={`inline-block w-4 h-4 ${theme === "light" ? "bg-red-50 border-[#D62311]" : "bg-red-900/30 border-red-500"} border-l-4 rounded-r`}></span>
                            <span className={`${mutedTextColor} font-medium transition-colors`}>Removed</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="inline-block w-4 h-4 bg-green-50 border-l-4 border-green-600 rounded-r"></span>
                            <span className={`${mutedTextColor} font-medium transition-colors`}>Added</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="inline-block w-4 h-4 bg-amber-50 border-l-4 border-amber-600 rounded-r"></span>
                            <span className={`${mutedTextColor} font-medium transition-colors`}>Risky</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="inline-block w-4 h-4 bg-yellow-200 rounded"></span>
                            <span className={`${mutedTextColor} font-medium transition-colors`}>Search Match</span>
                          </div>
                        </div>
                      )}
                    </div>
                    {/* Search Bar */}
                    <div>
                      <label htmlFor="schema-search" className={`block text-sm font-medium ${mutedTextColor} mb-2 transition-colors`}>
                        Search Schema
                      </label>
                      <input
                        id="schema-search"
                        type="text"
                        placeholder="Search for keys, values, or paths..."
                        value={schemaSearchQuery}
                        onChange={(e) => setSchemaSearchQuery(e.target.value)}
                        className={`w-full rounded border ${borderColor} px-4 py-2 text-sm ${inputBgColor} ${textColor} focus:outline-none focus:ring-2 ${theme === "light" ? "focus:ring-[#D62311]" : "focus:ring-[#76B900]"} focus:border-transparent transition-colors`}
                      />
                    </div>
                  </div>
                  <div className="overflow-auto max-h-96">
                    <div className="grid grid-cols-2 gap-4 p-4">
                      <div className="min-w-0">
                        <div className={`text-sm font-semibold ${mutedTextColor} mb-2 pb-1 border-b ${borderColor} sticky top-0 ${cardBgColor} z-10 transition-colors`}>Old Schema</div>
                        <div className={`rounded border ${borderColor} ${jsonBgColor} p-3 text-xs font-mono leading-relaxed transition-colors`}>
                          {report ? renderJsonWithHighlights(oldJson, report, true, "", 0, schemaSearchQuery, theme) : (
                            schemaSearchQuery ? (
                              <pre className={`whitespace-pre ${jsonTextColor} transition-colors`}>
                                {formatJson(oldJson).split('\n').map((line, i) => {
                                  const queryLower = schemaSearchQuery.toLowerCase();
                                  if (line.toLowerCase().includes(queryLower)) {
                                    const escapedQuery = escapeRegex(schemaSearchQuery);
                                    const parts = line.split(new RegExp(`(${escapedQuery})`, 'gi'));
                                    return (
                                      <span key={i}>
                                        {parts.map((part, j) => 
                                          part.toLowerCase() === queryLower ? (
                                            <span key={j} className={`${searchHighlightBg} font-semibold`}>{part}</span>
                                          ) : (
                                            <span key={j}>{part}</span>
                                          )
                                        )}
                                        {'\n'}
                                      </span>
                                    );
                                  }
                                  return <span key={i}>{line}{'\n'}</span>;
                                })}
                              </pre>
                            ) : (
                              <pre className={`whitespace-pre ${jsonTextColor} transition-colors`}>{formatJson(oldJson)}</pre>
                            )
                          )}
                        </div>
                      </div>
                      <div className="min-w-0">
                        <div className={`text-sm font-semibold ${mutedTextColor} mb-2 pb-1 border-b ${borderColor} sticky top-0 ${cardBgColor} z-10 transition-colors`}>New Schema</div>
                        <div className={`rounded border ${borderColor} ${jsonBgColor} p-3 text-xs font-mono leading-relaxed transition-colors`}>
                          {report ? renderJsonWithHighlights(newJson, report, false, "", 0, schemaSearchQuery, theme) : (
                            schemaSearchQuery ? (
                              <pre className={`whitespace-pre ${jsonTextColor} transition-colors`}>
                                {formatJson(newJson).split('\n').map((line, i) => {
                                  const queryLower = schemaSearchQuery.toLowerCase();
                                  if (line.toLowerCase().includes(queryLower)) {
                                    const escapedQuery = escapeRegex(schemaSearchQuery);
                                    const parts = line.split(new RegExp(`(${escapedQuery})`, 'gi'));
                                    return (
                                      <span key={i}>
                                        {parts.map((part, j) => 
                                          part.toLowerCase() === queryLower ? (
                                            <span key={j} className={`${searchHighlightBg} font-semibold`}>{part}</span>
                                          ) : (
                                            <span key={j}>{part}</span>
                                          )
                                        )}
                                        {'\n'}
                                      </span>
                                    );
                                  }
                                  return <span key={i}>{line}{'\n'}</span>;
                                })}
                              </pre>
                            ) : (
                              <pre className={`whitespace-pre ${jsonTextColor} transition-colors`}>{formatJson(newJson)}</pre>
                            )
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {report && typeof score==="number" && (
              <div className="space-y-6">
                <div>
                  <h4 className={`text-2xl font-bold ${textColor} mb-3 transition-colors`}>Migration Risk Assessment</h4>
                  <p className={`text-base ${mutedTextColor} transition-colors`}>Comprehensive analysis of schema changes and migration risks</p>
                </div>

                {/* Risk Score Card */}
                <div className={`${cardBgColor} border ${borderColor} rounded-lg p-6 transition-colors`}>
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
                    <div>
                      <div className={`text-sm font-semibold ${mutedTextColor} uppercase tracking-wide mb-1 transition-colors`}>Migration Risk Score</div>
                      <div className="flex items-baseline gap-2">
                        <div className={`text-5xl font-bold ${textColor} transition-colors`}>{score}</div>
                        <div className={`text-2xl ${mutedTextColor} transition-colors`}>/100</div>
                      </div>
                    </div>
                    <div className="flex gap-8">
                      <div className="flex flex-col">
                        <span className={`text-sm ${mutedTextColor} font-medium mb-1 transition-colors`}>Added</span>
                        <span className="text-2xl font-bold text-green-600">{report.summary.added}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className={`text-sm ${mutedTextColor} font-medium mb-1 transition-colors`}>Removed</span>
                        <span className={`text-2xl font-bold ${theme === "light" ? "text-[#D62311]" : "text-red-400"} transition-colors`}>{report.summary.removed}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className={`text-sm ${mutedTextColor} font-medium mb-1 transition-colors`}>Risky</span>
                        <span className="text-2xl font-bold text-amber-600">{report.summary.risky}</span>
                      </div>
                    </div>
                    <div className="shrink-0">
                      <span className={`inline-flex items-center rounded-full px-6 py-3 text-base font-bold text-white transition-colors ${
                        score<31?"bg-green-600":score<71?"bg-amber-500":theme === "light" ? "bg-[#D62311]" : "bg-[#76B900]"
                      }`}>
                        {score<31?"Low Risk":score<71?"Medium Risk":"High Risk"}
                      </span>
                    </div>
                  </div>
                  
                  {/* Download Buttons */}
                  <div className={`mt-6 pt-6 border-t ${borderColor} transition-colors`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <h6 className={`text-sm font-semibold ${mutedTextColor} mb-2 transition-colors`}>Download Report</h6>
                        <p className={`text-xs ${mutedTextColor} transition-colors`}>Export your migration analysis report</p>
                      </div>
                      <div className="flex gap-3">
                        <button
                          onClick={() => downloadCSV(report, score)}
                          className="px-4 py-2 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition-colors text-sm flex items-center gap-2"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          Download CSV
                        </button>
                        <button
                          onClick={() => downloadPDF(report, score, oldJson, newJson, ragOutput)}
                          className={`px-4 py-2 ${theme === "light" ? "bg-[#D62311] hover:bg-[#B41D0E]" : "bg-[#76B900] hover:bg-[#5A8F00]"} text-white font-semibold rounded-lg transition-colors text-sm flex items-center gap-2`}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          Download PDF
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* RAG Analysis Section */}
                <div className={`${cardBgColor} border ${borderColor} rounded-lg p-6 transition-colors`}>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h5 className={`text-lg font-semibold ${textColor} transition-colors`}>AI-Powered Change Explanation</h5>
                      <p className={`text-sm ${mutedTextColor} mt-1 transition-colors`}>Get an AI-generated explanation of the schema changes</p>
                    </div>
                    <button
                      onClick={analyzeWithRAG}
                      disabled={ragLoading || !report}
                      className={`px-4 py-2 ${theme === "light" ? "bg-[#D62311] hover:bg-[#B41D0E]" : "bg-[#76B900] hover:bg-[#5A8F00]"} text-white font-semibold rounded-lg disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors text-sm`}
                    >
                      {ragLoading ? "Analyzing..." : "Explain Changes with AI"}
                    </button>
                  </div>

                  {ragError && (
                    <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded">
                      <span className="text-sm font-medium text-red-800">{ragError}</span>
                    </div>
                  )}

                  {ragOutput && (
                    <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                      <h6 className="text-sm font-semibold text-blue-900 mb-3">AI Explanation:</h6>
                      <div className="text-sm text-blue-800 leading-relaxed prose prose-sm max-w-none">
                        {renderMarkdown(ragOutput)}
                      </div>
                    </div>
                  )}

                  {ragLoading && (
                    <div className={`mt-4 p-4 ${mutedBgColor} border ${borderColor} rounded-lg transition-colors`}>
                      <div className={`flex items-center gap-2 text-sm ${mutedTextColor} transition-colors`}>
                        <div className={`animate-spin rounded-full h-4 w-4 border-b-2 ${theme === "light" ? "border-[#D62311]" : "border-[#76B900]"} transition-colors`}></div>
                        <span>Analyzing changes with AI...</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Change Summary Table */}
                <div className={`${cardBgColor} border ${borderColor} rounded-lg overflow-hidden transition-colors`}>
                  <div className={`${headerBgColor} px-6 py-4 transition-colors`}>
                    <h5 className="text-lg font-semibold text-white">Change Summary</h5>
                    <p className={`text-sm ${theme === "light" ? "text-red-100" : "text-green-100"} mt-1 transition-colors`}>Detailed breakdown of schema differences</p>
                  </div>
                  
                  {/* Search and Filter Controls */}
                  <div className={`px-6 py-4 ${mutedBgColor} border-b ${borderColor} space-y-4 transition-colors`}>
                    {/* Search Bar */}
                    <div>
                      <label htmlFor="path-search" className={`block text-sm font-medium ${mutedTextColor} mb-2 transition-colors`}>
                        Search by Path
                      </label>
                      <input
                        id="path-search"
                        type="text"
                        placeholder="Search path names..."
                        value={searchQuery}
                        onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                        className={`w-full rounded border ${borderColor} px-4 py-2 text-sm ${inputBgColor} ${textColor} focus:outline-none focus:ring-2 ${theme === "light" ? "focus:ring-[#D62311]" : "focus:ring-[#76B900]"} focus:border-transparent transition-colors`}
                      />
                    </div>
                    
                    {/* Filter Buttons */}
                    <div>
                      <label className={`block text-sm font-medium ${mutedTextColor} mb-2 transition-colors`}>
                        Filter by Change Type
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => { setSelectedChangeType("ALL"); setCurrentPage(1); }}
                          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                            selectedChangeType === "ALL"
                              ? `${theme === "light" ? "bg-[#D62311]" : "bg-[#76B900]"} text-white`
                              : `${cardBgColor} ${mutedTextColor} border ${borderColor} ${theme === "light" ? "hover:bg-gray-50" : "hover:bg-gray-800"}`
                          }`}
                        >
                          All ({report.changes.length})
                        </button>
                        <button
                          onClick={() => { setSelectedChangeType("REMOVED_FIELD"); setCurrentPage(1); }}
                          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                            selectedChangeType === "REMOVED_FIELD"
                              ? "bg-red-600 text-white"
                              : `${cardBgColor} text-red-700 border border-red-300 hover:bg-red-50/10`
                          }`}
                        >
                          Removed ({report.summary.removed})
                        </button>
                        <button
                          onClick={() => { setSelectedChangeType("ADDED_FIELD"); setCurrentPage(1); }}
                          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                            selectedChangeType === "ADDED_FIELD"
                              ? "bg-green-600 text-white"
                              : `${cardBgColor} text-green-700 border border-green-300 hover:bg-green-50/10`
                          }`}
                        >
                          Added ({report.summary.added})
                        </button>
                        <button
                          onClick={() => { setSelectedChangeType("TYPE_CHANGED"); setCurrentPage(1); }}
                          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                            selectedChangeType === "TYPE_CHANGED"
                              ? "bg-amber-600 text-white"
                              : `${cardBgColor} text-amber-700 border border-amber-300 hover:bg-amber-50/10`
                          }`}
                        >
                          Type Changed ({report.changes.filter(c => c.kind === "TYPE_CHANGED").length})
                        </button>
                      </div>
                    </div>

                    {/* Items Per Page and Pagination Controls */}
                    <div className="flex items-center justify-between flex-wrap gap-4">
                      <div className="flex items-center gap-2">
                        <label htmlFor="items-per-page" className={`text-sm font-medium ${mutedTextColor} transition-colors`}>
                          Items per page:
                        </label>
                        <select
                          id="items-per-page"
                          value={itemsPerPage}
                          onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }}
                          className={`rounded border ${borderColor} px-3 py-1.5 text-sm ${inputBgColor} ${textColor} focus:outline-none focus:ring-2 ${theme === "light" ? "focus:ring-[#D62311]" : "focus:ring-[#76B900]"} focus:border-transparent transition-colors`}
                        >
                          <option value={10}>10</option>
                          <option value={25}>25</option>
                          <option value={50}>50</option>
                        </select>
                      </div>
                    </div>
                  </div>
                  
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className={`${mutedBgColor} border-b ${borderColor} transition-colors`}>
                        <tr>
                          <th className={`px-6 py-3 text-left text-xs font-semibold ${mutedTextColor} uppercase tracking-wider transition-colors`}>Path</th>
                          <th className={`px-6 py-3 text-left text-xs font-semibold ${mutedTextColor} uppercase tracking-wider transition-colors`}>Change Type</th>
                          <th className={`px-6 py-3 text-left text-xs font-semibold ${mutedTextColor} uppercase tracking-wider transition-colors`}>Details</th>
                        </tr>
                      </thead>
                      <tbody className={`${cardBgColor} divide-y ${borderColor} transition-colors`}>
                        {(() => {
                          const filteredChanges = report.changes.filter((c) => {
                            // Filter by change type
                            if (selectedChangeType !== "ALL" && c.kind !== selectedChangeType) {
                              return false;
                            }
                            // Filter by search query
                            if (searchQuery && !(c as any).path.toLowerCase().includes(searchQuery.toLowerCase())) {
                              return false;
                            }
                            return true;
                          });

                          // Calculate pagination
                          const totalItems = filteredChanges.length;
                          const totalPages = Math.ceil(totalItems / itemsPerPage);
                          const validPage = Math.min(Math.max(1, currentPage), totalPages || 1);
                          const startIndex = (validPage - 1) * itemsPerPage;
                          const endIndex = startIndex + itemsPerPage;
                          const paginatedChanges = filteredChanges.slice(startIndex, endIndex);

                          if (filteredChanges.length === 0) {
                            return (
                              <tr>
                                <td colSpan={3} className={`px-6 py-8 text-center ${mutedTextColor} transition-colors`}>
                                  No changes found matching your filters.
                                </td>
                              </tr>
                            );
                          }

                          return paginatedChanges.map((c, i) => (
                            <tr key={startIndex + i} className={`${theme === "light" ? "hover:bg-gray-50" : "hover:bg-gray-800"} transition-colors`}>
                              <td className={`px-6 py-4 font-mono text-xs ${textColor} transition-colors`}>{(c as any).path}</td>
                              <td className="px-6 py-4">
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                                  c.kind === "REMOVED_FIELD" ? "bg-red-100 text-red-800" :
                                  c.kind === "ADDED_FIELD" ? "bg-green-100 text-green-800" :
                                  "bg-amber-100 text-amber-800"
                                }`}>
                                  {c.kind.replace(/_/g, " ")}
                                </span>
                              </td>
                              <td className={`px-6 py-4 ${mutedTextColor} transition-colors`}>
                                {"oldType" in c && "newType" in c ? (
                                  <span className="font-medium">{`${(c as any).oldType} → ${(c as any).newType}`}</span>
                                ) : "oldType" in c ? (
                                  <span className="text-red-700 font-medium">{(c as any).oldType}</span>
                                ) : "newType" in c ? (
                                  <span className="text-green-700 font-medium">{(c as any).newType}</span>
                                ) : (
                                  <span className={mutedTextColor}>—</span>
                                )}
                              </td>
                            </tr>
                          ));
                        })()}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination Controls */}
                  {(() => {
                    const filteredChanges = report.changes.filter((c) => {
                      if (selectedChangeType !== "ALL" && c.kind !== selectedChangeType) {
                        return false;
                      }
                      if (searchQuery && !(c as any).path.toLowerCase().includes(searchQuery.toLowerCase())) {
                        return false;
                      }
                      return true;
                    });
                    const totalItems = filteredChanges.length;
                    const totalPages = Math.ceil(totalItems / itemsPerPage);
                    const startItem = totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
                    const endItem = Math.min(currentPage * itemsPerPage, totalItems);

                    if (totalPages <= 1) return null;

                    const getPageNumbers = () => {
                      const pages: (number | string)[] = [];
                      const maxVisible = 5;
                      
                      if (totalPages <= maxVisible) {
                        for (let i = 1; i <= totalPages; i++) {
                          pages.push(i);
                        }
                      } else {
                        if (currentPage <= 3) {
                          for (let i = 1; i <= 4; i++) {
                            pages.push(i);
                          }
                          pages.push("...");
                          pages.push(totalPages);
                        } else if (currentPage >= totalPages - 2) {
                          pages.push(1);
                          pages.push("...");
                          for (let i = totalPages - 3; i <= totalPages; i++) {
                            pages.push(i);
                          }
                        } else {
                          pages.push(1);
                          pages.push("...");
                          for (let i = currentPage - 1; i <= currentPage + 1; i++) {
                            pages.push(i);
                          }
                          pages.push("...");
                          pages.push(totalPages);
                        }
                      }
                      return pages;
                    };

                    return (
                      <div className={`px-6 py-4 ${mutedBgColor} border-t ${borderColor} flex items-center justify-between flex-wrap gap-4 transition-colors`}>
                        <div className={`text-sm ${mutedTextColor} transition-colors`}>
                          Showing <span className="font-medium">{startItem}</span> to <span className="font-medium">{endItem}</span> of{" "}
                          <span className="font-medium">{totalItems}</span> results
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                            disabled={currentPage === 1}
                            className={`px-3 py-2 text-sm font-medium ${mutedTextColor} ${cardBgColor} border ${borderColor} rounded-lg ${theme === "light" ? "hover:bg-gray-50" : "hover:bg-gray-800"} disabled:opacity-50 disabled:cursor-not-allowed transition-colors`}
                          >
                            Previous
                          </button>
                          <div className="flex items-center gap-1">
                            {getPageNumbers().map((page, idx) => (
                              page === "..." ? (
                                <span key={`ellipsis-${idx}`} className={`px-2 py-2 ${mutedTextColor} transition-colors`}>...</span>
                              ) : (
                                <button
                                  key={page}
                                  onClick={() => setCurrentPage(page as number)}
                                  className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                                    currentPage === page
                                      ? `${theme === "light" ? "bg-[#D62311]" : "bg-[#76B900]"} text-white`
                                      : `${mutedTextColor} ${cardBgColor} border ${borderColor} ${theme === "light" ? "hover:bg-gray-50" : "hover:bg-gray-800"}`
                                  }`}
                                >
                                  {page}
                                </button>
                              )
                            ))}
                          </div>
                          <button
                            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                            disabled={currentPage === totalPages}
                            className={`px-3 py-2 text-sm font-medium ${mutedTextColor} ${cardBgColor} border ${borderColor} rounded-lg ${theme === "light" ? "hover:bg-gray-50" : "hover:bg-gray-800"} disabled:opacity-50 disabled:cursor-not-allowed transition-colors`}
                          >
                            Next
                          </button>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>

          {/* Right Column - Form Panel */}
          <div className="lg:col-span-1 space-y-6">
            {/* Form Panel - Fixed/Sticky */}
            <div className={`${theme === "light" ? "bg-gray-100" : "bg-gray-900"} rounded-lg p-6 top-8 transition-colors`}>
              <h3 className={`text-lg font-bold ${textColor} mb-4 transition-colors`}>Ready to analyze your APIs?</h3>
              
              <div className="space-y-4">
                <div>
                  <label className={`block text-sm font-semibold ${mutedTextColor} mb-2 transition-colors`}>Old API (URL or file)</label>
                  <input 
                    className={`w-full rounded border ${borderColor} px-4 py-2.5 text-sm ${inputBgColor} ${textColor} focus:outline-none focus:ring-2 ${theme === "light" ? "focus:ring-[#D62311]" : "focus:ring-[#76B900]"} focus:border-transparent transition-colors`}
                    placeholder="Enter URL or select file"
                    value={oldUrl} 
                    onChange={e=>setOldUrl(e.target.value)} 
                  />
                  <input 
                    type="file" 
                    accept="application/json" 
                    onChange={e=>setOldFile(e.target.files?.[0]||null)}
                    className={`w-full mt-2 text-sm ${mutedTextColor} file:mr-4 file:py-2 file:px-4 file:rounded file:text-sm file:font-semibold ${theme === "light" ? "file:bg-white file:text-[#D62311] file:border-[#D62311] hover:file:bg-gray-50" : "file:bg-gray-800 file:text-[#76B900] file:border-[#76B900] hover:file:bg-gray-700"} file:border cursor-pointer transition-colors`}
                  />
                </div>
                
                <div>
                  <label className={`block text-sm font-semibold ${mutedTextColor} mb-2 transition-colors`}>New API (URL or file)</label>
                  <input 
                    className={`w-full rounded border ${borderColor} px-4 py-2.5 text-sm ${inputBgColor} ${textColor} focus:outline-none focus:ring-2 ${theme === "light" ? "focus:ring-[#D62311]" : "focus:ring-[#76B900]"} focus:border-transparent transition-colors`}
                    placeholder="Enter URL or select file"
                    value={newUrl} 
                    onChange={e=>setNewUrl(e.target.value)} 
                  />
                  <input 
                    type="file" 
                    accept="application/json" 
                    onChange={e=>setNewFile(e.target.files?.[0]||null)}
                    className={`w-full mt-2 text-sm ${mutedTextColor} file:mr-4 file:py-2 file:px-4 file:rounded file:text-sm file:font-semibold ${theme === "light" ? "file:bg-white file:text-[#D62311] file:border-[#D62311] hover:file:bg-gray-50" : "file:bg-gray-800 file:text-[#76B900] file:border-[#76B900] hover:file:bg-gray-700"} file:border cursor-pointer transition-colors`}
                  />
                </div>

                {error && (
                  <div className="px-4 py-3 bg-red-50 border border-red-200 rounded">
                    <span className="text-sm font-medium text-red-800">{error}</span>
                  </div>
                )}

                <button 
                  onClick={analyze} 
                  disabled={loading} 
                  className={`w-full py-4 ${theme === "light" ? "bg-[#D62311] hover:bg-[#B41D0E]" : "bg-[#76B900] hover:bg-[#5A8F00]"} text-white font-bold rounded-lg disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors duration-200 text-base`}
                >
                  {loading ? "Analyzing…" : "Analyze APIs"}
                </button>
              </div>
            </div>

            {/* Risk Score Explanation Section */}
            {report && typeof score === "number" && (
              <div className={`${theme === "light" ? "bg-gray-100" : "bg-gray-900"} rounded-lg p-6 transition-colors`}>
                <h3 className={`text-lg font-bold ${textColor} mb-4 transition-colors`}>Understanding Your Migration Risk Score</h3>
                
                <div className="space-y-4">
                  <div>
                    <p className={`text-sm ${mutedTextColor} mb-3 transition-colors`}>
                      Your Migration Risk Score of <span className={`font-bold ${textColor} transition-colors`}>{score}/100</span> indicates a{" "}
                      <span className={`font-bold ${
                        score < 31 ? "text-green-600" : score < 71 ? "text-amber-600" : theme === "light" ? "text-[#D62311]" : "text-[#76B900]"
                      } transition-colors`}>
                        {score < 31 ? "Low Risk" : score < 71 ? "Medium Risk" : "High Risk"}
                      </span>{" "}
                      migration. This score is calculated based on the types and severity of changes detected between your API versions.
                    </p>
                  </div>

                  <div>
                    <h4 className={`text-sm font-semibold ${textColor} mb-2 transition-colors`}>Score Ranges:</h4>
                    <div className={`space-y-2 text-sm ${mutedTextColor} transition-colors`}>
                      <div className="flex items-start gap-2">
                        <span className="inline-flex items-center justify-center w-16 h-6 rounded bg-green-600 text-white text-xs font-bold shrink-0">0-30</span>
                        <span><strong>Low Risk:</strong> MINOR/PATCH level changes. Mostly backward-compatible additions that don't break existing clients.</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="inline-flex items-center justify-center w-16 h-6 rounded bg-amber-500 text-white text-xs font-bold shrink-0">31-70</span>
                        <span><strong>Medium Risk:</strong> Some breaking changes detected. Requires client code updates but migration is manageable.</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className={`inline-flex items-center justify-center w-16 h-6 rounded ${theme === "light" ? "bg-[#D62311]" : "bg-[#76B900]"} text-white text-xs font-bold shrink-0 transition-colors`}>71-100</span>
                        <span><strong>High Risk:</strong> MAJOR breaking changes. Significant API overhaul requiring extensive client-side refactoring.</span>
                      </div>
                    </div>
                  </div>

                  <div className={`border-t ${borderColor} pt-4 transition-colors`}>
                    <h4 className={`text-sm font-semibold ${textColor} mb-2 transition-colors`}>Scoring Criteria:</h4>
                    <div className={`space-y-2 text-sm ${mutedTextColor} transition-colors`}>
                      <div className="flex items-start gap-2">
                        <span className={`${theme === "light" ? "text-[#D62311]" : "text-[#76B900]"} font-bold shrink-0 transition-colors`}>•</span>
                        <div>
                          <strong>Removed Fields (40 points):</strong> Fields that were deleted from the API. 
                          This is the most severe change as it completely breaks clients using these fields.
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-amber-600 font-bold shrink-0">•</span>
                        <div>
                          <strong>Type Changes - Structural (35 points):</strong> Changing to/from objects or arrays. 
                          Example: A number field becomes an object with nested properties.
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-amber-600 font-bold shrink-0">•</span>
                        <div>
                          <strong>Type Changes - Incompatible (25 points):</strong> Types that cannot be safely converted. 
                          Example: A boolean field becomes a number.
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-yellow-600 font-bold shrink-0">•</span>
                        <div>
                          <strong>Type Changes - Compatible (15 points):</strong> Types that can sometimes be converted. 
                          Example: A string field becomes a number (e.g., "123" → 123).
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-green-600 font-bold shrink-0">•</span>
                        <div>
                          <strong>Added Fields (5 points):</strong> New fields added to the API. 
                          Generally backward-compatible but adds complexity to the schema.
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded p-3">
                    <p className="text-xs text-blue-800">
                      <strong>Note:</strong> The score uses an exponential normalization formula to prevent score explosion 
                      with many changes while still accurately reflecting the compound risk of multiple breaking changes.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}