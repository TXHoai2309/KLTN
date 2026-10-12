"use client";
import "./rich-text-editor.css";
import { useEditor, EditorContent } from "@tiptap/react";
import { closeHistory } from "@tiptap/pm/history";
import StarterKit from "@tiptap/starter-kit";
import LinkExtension from "@tiptap/extension-link";
import PlaceholderExtension from "@tiptap/extension-placeholder";
import CharacterCount from "@tiptap/extension-character-count";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Pilcrow,
  Bold,
  Italic,
  List,
  ListOrdered,
  Heading2,
  Heading3,
  Quote,
  Link2,
  Link2Off,
  Undo2,
  Redo2,
  Eye,
  Pencil,
  Eraser,
  ChevronDown,
} from "lucide-react";

import "@/components/culture-content.css";
import CultureContent from "@/components/culture-content";
import {
  contentForEditor,
  serializeRichContent,
  safeContentLink,
  type RichNode,
} from "@/modules/culture/culture-rich-content";
const OUTLINE_TITLES = [
  "Giới thiệu",
  "Nguồn gốc và lịch sử",
  "Đặc điểm văn hóa",
  "Phong tục và cách thực hành",
  "Ý nghĩa và giá trị",
  "Bảo tồn và trải nghiệm du lịch",
];

/* ── Toolbar button ───────────────────────────────────────────────────────── */
function ToolBtn({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`rte-btn${active ? " is-active" : ""}`}
    >
      {children}
    </button>
  );
}

/* ── Main component ───────────────────────────────────────────────────────── */
export interface RichTextEditorProps {
  value: string; // Versioned rich document or untouched legacy prose
  onChange: (markdown: string) => void;
  placeholder?: string;
  maxLength?: number;
  id?: string;
  hasError?: boolean;
  disabled?: boolean;
}

export default function RichTextEditor({
  value,
  onChange,
  placeholder = "Nhập nội dung văn hóa tại đây…",
  maxLength = 20000,
  id,
  hasError = false,
  disabled = false,
}: RichTextEditorProps) {
  const [showPreview, setShowPreview] = useState(false);
  const [showLinkBar, setShowLinkBar] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const lastEmitted = useRef(value);
  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        codeBlock: false,
        code: false,
        link: false,
        underline: false,
        strike: false,
        horizontalRule: false,
      }),
      LinkExtension.configure({
        openOnClick: false,
        HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
        // Validate links: only http/https
        isAllowedUri: safeContentLink,
      }),
      PlaceholderExtension.configure({ placeholder }),
      CharacterCount.configure({ limit: maxLength }),
    ],
    content: contentForEditor(value),
    editorProps: {
      transformPastedHTML: (html) => {
        const parsed = new DOMParser().parseFromString(html, "text/html");
        parsed
          .querySelectorAll(
            "script,style,iframe,object,embed,svg,math,img,video,audio,form,input",
          )
          .forEach((el) => el.remove());
        for (const el of parsed.body.querySelectorAll("*")) {
          for (const attr of Array.from(el.attributes))
            if (
              !(
                el.tagName === "A" &&
                attr.name === "href" &&
                safeContentLink(attr.value)
              ) &&
              !(
                el.tagName === "OL" &&
                attr.name === "start" &&
                /^[1-9]\d*$/.test(attr.value)
              )
            )
              el.removeAttribute(attr.name);
        }
        return parsed.body.innerHTML;
      },
      attributes: {
        id: id ?? "culture-editor",
        role: "textbox",
        "aria-label": "Nội dung văn hóa",
        "aria-multiline": "true",
        "aria-invalid": String(hasError),
        "aria-describedby": hasError ? "err-content" : "",
      },
    },
    editable: !disabled,
    onUpdate: ({ editor: ed }) => {
      const stored = serializeRichContent(ed.getJSON() as RichNode);
      lastEmitted.current = stored;
      onChangeRef.current(stored);
    },
  });

  useEffect(() => {
    if (editor && value !== lastEmitted.current) {
      lastEmitted.current = value;
      editor.commands.setContent(contentForEditor(value), {
        emitUpdate: false,
      });
    }
  }, [value, editor]);

  useEffect(() => {
    if (editor) editor.setEditable(!disabled, false);
  }, [disabled, editor]);

  const charCount = editor?.storage.characterCount.characters() ?? 0;
  const wordCount = editor?.storage.characterCount.words() ?? 0;
  const nearLimit = value.length > maxLength * 0.9;
  const atLimit = value.length >= maxLength;

  const insertOutline = useCallback(() => {
    if (!editor) return;
    // Only insert if editor is mostly empty
    const currentText = editor.getText().trim();
    if (
      currentText &&
      !window.confirm(
        "Chèn dàn ý sẽ thêm các tiêu đề sau nội dung hiện tại. Tiếp tục?",
      )
    )
      return;
    editor
      .chain()
      .focus()
      .command(({ tr }) => {
        closeHistory(tr);
        return true;
      })
      .insertContentAt(
        editor.state.doc.content.size,
        OUTLINE_TITLES.map((text) => ({
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text }],
        })),
      )
      .run();
  }, [editor]);

  const setLink = useCallback(() => {
    if (!editor || !linkUrl.trim()) return;
    const url = linkUrl.trim();
    if (!safeContentLink(url)) {
      alert("Chỉ chấp nhận URL bắt đầu bằng http:// hoặc https://");
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    setLinkUrl("");
    setShowLinkBar(false);
  }, [editor, linkUrl]);

  const removeLink = useCallback(() => {
    editor?.chain().focus().unsetLink().run();
    setShowLinkBar(false);
  }, [editor]);

  if (!editor) return <p role="status">Đang tải trình soạn thảo…</p>;

  return (
    <div
      className={`rte-wrap${hasError ? " has-error" : ""}`}
      aria-label="Trình soạn thảo nội dung văn hóa"
    >
      {/* Toolbar */}
      <div
        className="rte-toolbar"
        role="toolbar"
        aria-label="Công cụ biên soạn"
      >
        <div className="rte-toolbar-group">
          <ToolBtn
            label="Đoạn văn"
            active={editor.isActive("paragraph")}
            disabled={disabled}
            onClick={() => editor.chain().focus().setParagraph().run()}
          >
            <Pilcrow size={16} />
          </ToolBtn>
          <ToolBtn
            label="Tiêu đề H2 (Ctrl+Alt+2)"
            active={editor.isActive("heading", { level: 2 })}
            disabled={disabled}
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 2 }).run()
            }
          >
            <Heading2 size={16} />
          </ToolBtn>
          <ToolBtn
            label="Tiêu đề H3 (Ctrl+Alt+3)"
            active={editor.isActive("heading", { level: 3 })}
            disabled={disabled}
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 3 }).run()
            }
          >
            <Heading3 size={16} />
          </ToolBtn>
        </div>
        <div className="rte-toolbar-sep" aria-hidden="true" />
        <div className="rte-toolbar-group">
          <ToolBtn
            label="In đậm (Ctrl+B)"
            active={editor.isActive("bold")}
            disabled={disabled}
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            <Bold size={15} />
          </ToolBtn>
          <ToolBtn
            label="In nghiêng (Ctrl+I)"
            active={editor.isActive("italic")}
            disabled={disabled}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            <Italic size={15} />
          </ToolBtn>
        </div>
        <div className="rte-toolbar-sep" aria-hidden="true" />
        <div className="rte-toolbar-group">
          <ToolBtn
            label="Danh sách gạch đầu dòng"
            active={editor.isActive("bulletList")}
            disabled={disabled}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          >
            <List size={16} />
          </ToolBtn>
          <ToolBtn
            label="Danh sách đánh số"
            active={editor.isActive("orderedList")}
            disabled={disabled}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          >
            <ListOrdered size={16} />
          </ToolBtn>
          <ToolBtn
            label="Trích dẫn"
            active={editor.isActive("blockquote")}
            disabled={disabled}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
          >
            <Quote size={15} />
          </ToolBtn>
        </div>
        <div className="rte-toolbar-sep" aria-hidden="true" />
        <div className="rte-toolbar-group">
          <ToolBtn
            label={
              editor.isActive("link") ? "Chỉnh sửa liên kết" : "Chèn liên kết"
            }
            active={editor.isActive("link") || showLinkBar}
            disabled={disabled}
            onClick={() => {
              if (editor.isActive("link")) {
                const attrs = editor.getAttributes("link");
                setLinkUrl((attrs.href as string | undefined) ?? "");
              } else {
                setLinkUrl("");
              }
              setShowLinkBar((v) => !v);
            }}
          >
            <Link2 size={15} />
          </ToolBtn>
          {editor.isActive("link") && (
            <ToolBtn
              label="Xóa liên kết"
              disabled={disabled}
              onClick={removeLink}
            >
              <Link2Off size={15} />
            </ToolBtn>
          )}
        </div>
        <div className="rte-toolbar-sep" aria-hidden="true" />
        <div className="rte-toolbar-group">
          <ToolBtn
            label="Hoàn tác (Ctrl+Z)"
            disabled={disabled || !editor.can().undo()}
            onClick={() => editor.chain().focus().undo().run()}
          >
            <Undo2 size={15} />
          </ToolBtn>
          <ToolBtn
            label="Làm lại (Ctrl+Y)"
            disabled={disabled || !editor.can().redo()}
            onClick={() => editor.chain().focus().redo().run()}
          >
            <Redo2 size={15} />
          </ToolBtn>
          <ToolBtn
            label="Xóa định dạng"
            disabled={disabled}
            onClick={() =>
              editor
                .chain()
                .focus()
                .command(({ tr }) => {
                  closeHistory(tr);
                  return true;
                })
                .clearNodes()
                .unsetAllMarks()
                .run()
            }
          >
            <Eraser size={15} />
          </ToolBtn>
        </div>
        <div className="rte-toolbar-sep" aria-hidden="true" />
        <ToolBtn
          label={showPreview ? "Chỉnh sửa" : "Xem trước"}
          active={showPreview}
          onClick={() => setShowPreview((v) => !v)}
        >
          {showPreview ? <Pencil size={15} /> : <Eye size={15} />}
        </ToolBtn>
      </div>

      {/* Link input bar */}
      {showLinkBar && !disabled && (
        <div className="rte-link-bar" role="group" aria-label="Nhập liên kết">
          <input
            className="rte-link-input"
            type="url"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                setLink();
              }
              if (e.key === "Escape") setShowLinkBar(false);
            }}
            placeholder="https://..."
            autoFocus
            aria-label="URL liên kết"
          />
          <button
            type="button"
            className="af-btn af-btn-primary"
            style={{ minHeight: 34, padding: "5px 12px", fontSize: 12 }}
            onClick={setLink}
          >
            Áp dụng
          </button>
          <button
            type="button"
            className="af-btn"
            style={{ minHeight: 34, padding: "5px 10px", fontSize: 12 }}
            onClick={() => setShowLinkBar(false)}
          >
            Hủy
          </button>
        </div>
      )}

      {/* Editor / Preview area */}
      <div
        className="rte-content"
        onClick={() => !showPreview && editor.commands.focus()}
      >
        {showPreview ? (
          <div className="rte-preview-wrap" aria-label="Xem trước nội dung">
            <CultureContent content={value} />
          </div>
        ) : (
          <EditorContent editor={editor} />
        )}
      </div>

      {/* Footer */}
      <div className="rte-footer">
        <span
          className={`rte-char-count${atLimit ? " is-at-limit" : nearLimit ? " is-near-limit" : ""}`}
          aria-live="polite"
        >
          {charCount.toLocaleString("vi-VN")} ký tự · {wordCount} từ ·{" "}
          {value.length.toLocaleString("vi-VN")}/
          {maxLength.toLocaleString("vi-VN")} ký tự lưu trữ
        </span>
        <div className="rte-footer-actions">
          <button
            type="button"
            className="rte-footer-btn"
            onClick={insertOutline}
            disabled={disabled}
            title="Chèn dàn ý gợi ý gồm 6 tiêu đề H2 rỗng. Bạn có thể xóa bất kỳ tiêu đề nào không phù hợp."
          >
            Chèn dàn ý gợi ý
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Structure guide (collapsible hint) ─────────────────────────────────── */
export function RteStructureGuide() {
  return (
    <details className="rte-guide">
      <summary>
        <ChevronDown size={14} aria-hidden="true" />
        Gợi ý cấu trúc bài viết văn hóa
      </summary>
      <ol>
        <li>Giới thiệu tổng quan về nội dung văn hóa</li>
        <li>Nguồn gốc và lịch sử hình thành</li>
        <li>Đặc điểm và hình thức biểu hiện</li>
        <li>Phong tục, nghi lễ hoặc cách thực hành</li>
        <li>Ý nghĩa và giá trị trong cộng đồng</li>
        <li>Bảo tồn, phát triển và trải nghiệm du lịch</li>
      </ol>
    </details>
  );
}
