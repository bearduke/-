"""
View层 - MVC架构的UI代码
包含所有界面构建，不含业务逻辑
所有操作通过回调函数委托给Controller
"""

import tkinter as tk
from tkinter import ttk, filedialog
from . import utils
from .utils import (
    WINDOW_WIDTH, WINDOW_HEIGHT, CLIPBOARD_PANEL_WIDTH,
    track_focus, format_money, parse_money, get_all_case_nos,
    CASES_DB, datetime
)
import pyperclip


# ==================== 日期选择器对话框 ====================

def open_date_picker(parent, entry_widget, date_var):
    """打开一个简单的日期选择对话框，选择后回填到指定的Entry"""
    dialog = tk.Toplevel(parent)
    dialog.title("选择日期")
    dialog.geometry("320x250")
    dialog.transient(parent)
    dialog.grab_set()
    dialog.resizable(False, False)

    # 居中于父窗口
    dialog.update_idletasks()
    px = parent.winfo_rootx() + parent.winfo_width() // 2 - 160
    py = parent.winfo_rooty() + parent.winfo_height() // 2 - 125
    dialog.geometry(f"+{px}+{py}")

    # 解析当前值
    current = date_var.get().strip()
    try:
        current_dt = datetime.strptime(current, "%Y-%m-%d")
        init_year = current_dt.year
        init_month = current_dt.month
        init_day = current_dt.day
    except Exception:
        now = datetime.now()
        init_year = now.year
        init_month = now.month
        init_day = now.day

    frame = tk.Frame(dialog, padx=15, pady=10)
    frame.pack(fill=tk.BOTH, expand=True)

    # 年
    tk.Label(frame, text="年", font=("仿宋", 12)).grid(row=0, column=0, padx=3)
    year_var = tk.StringVar(value=str(init_year))
    year_spin = tk.Spinbox(frame, from_=2000, to=2099, textvariable=year_var,
                           width=6, font=("Arial", 12), increment=1)
    year_spin.grid(row=0, column=1, padx=3)

    # 月
    tk.Label(frame, text="月", font=("仿宋", 12)).grid(row=0, column=2, padx=3)
    month_var = tk.StringVar(value=str(init_month))
    month_spin = tk.Spinbox(frame, from_=1, to=12, textvariable=month_var,
                            width=4, font=("Arial", 12), increment=1)
    month_spin.grid(row=0, column=3, padx=3)

    # 日
    tk.Label(frame, text="日", font=("仿宋", 12)).grid(row=0, column=4, padx=3)
    day_var = tk.StringVar(value=str(init_day))
    day_spin = tk.Spinbox(frame, from_=1, to=31, textvariable=day_var,
                          width=4, font=("Arial", 12), increment=1)
    day_spin.grid(row=0, column=5, padx=3)

    # 快捷按钮
    quick_frame = tk.Frame(frame)
    quick_frame.grid(row=1, column=0, columnspan=6, pady=8)

    def set_today():
        now = datetime.now()
        year_var.set(str(now.year))
        month_var.set(str(now.month))
        day_var.set(str(now.day))

    tk.Button(quick_frame, text="今天", font=("仿宋", 10), command=set_today,
              bg="#5bc0de", width=6).pack(side=tk.LEFT, padx=3)

    # 确认/取消
    btn_frame = tk.Frame(frame)
    btn_frame.grid(row=2, column=0, columnspan=6, pady=5)

    def confirm():
        try:
            y = int(year_var.get())
            m = int(month_var.get())
            d = int(day_var.get())
            dt = datetime(y, m, d)
            date_var.set(dt.strftime("%Y-%m-%d"))
            dialog.destroy()
        except ValueError:
            from tkinter import messagebox
            messagebox.showwarning("提示", "日期格式无效，请检查", parent=dialog)

    tk.Button(btn_frame, text="确定", font=("仿宋", 11), command=confirm,
              bg="#5cb85c", fg="white", width=8).pack(side=tk.LEFT, padx=5)
    tk.Button(btn_frame, text="取消", font=("仿宋", 11), command=dialog.destroy,
              bg="#d9534f", fg="white", width=8).pack(side=tk.LEFT, padx=5)


def create_date_entry(parent, date_var, width=15, entry_font=("Arial", 11)):
    """创建一个日期输入组件：tk.Entry + 📅按钮，替代tkcalendar.DateEntry

    返回: (frame, entry) 元组，frame是容器，entry是输入框
    """
    frame = tk.Frame(parent)
    entry = tk.Entry(frame, textvariable=date_var, font=entry_font, width=width)
    entry.pack(side=tk.LEFT)
    entry.bind("<FocusIn>", track_focus)

    btn = tk.Button(frame, text="...", font=("Arial", 9), width=2,
                    command=lambda: open_date_picker(frame, entry, date_var))
    btn.pack(side=tk.LEFT, padx=1)

    return frame, entry


# ==================== 剪贴板历史面板 ====================

class ClipboardPanel(tk.Frame):
    def __init__(self, parent, **kwargs):
        super().__init__(parent, width=CLIPBOARD_PANEL_WIDTH, bg="#f0f0f0", **kwargs)
        self.pack_propagate(False)

        self.history = []
        self.max_history = 20
        self.last_clipboard = ""
        self.monitoring = True

        title_label = tk.Label(self, text="剪贴板历史", font=("仿宋", 14, "bold"),
                              bg="#f0f0f0", fg="#333")
        title_label.pack(pady=(10, 5))

        list_frame = tk.Frame(self, bg="#f0f0f0")
        list_frame.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)

        self.listbox = tk.Listbox(list_frame, font=("Arial", 10),
                                  selectmode=tk.SINGLE, bg="white",
                                  selectbackground="#4a90d9", selectforeground="white")
        scrollbar = tk.Scrollbar(list_frame, orient=tk.VERTICAL, command=self.listbox.yview)
        self.listbox.config(yscrollcommand=scrollbar.set)

        self.listbox.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)

        # 在单击时捕获当前焦点控件（双击第一击会把焦点给listbox，必须在之前记录）
        self._clicked_focus = None
        self.listbox.bind("<Button-1>", self._on_listbox_click)
        self.listbox.bind("<Double-Button-1>", self.on_double_click)

        clear_btn = tk.Button(self, text="清空历史", font=("仿宋", 10),
                             command=self.clear_history, bg="#ddd")
        clear_btn.pack(pady=5)

        self.monitor_clipboard()

    def monitor_clipboard(self):
        if not self.monitoring:
            return
        try:
            current = pyperclip.paste()
            if current and current != self.last_clipboard and len(current.strip()) > 0:
                self.last_clipboard = current
                self.add_to_history(current)
        except Exception:
            pass
        self.after(500, self.monitor_clipboard)

    def add_to_history(self, text):
        display_text = text[:50] + "..." if len(text) > 50 else text
        self.history.insert(0, {"display": display_text, "full": text})
        if len(self.history) > self.max_history:
            self.history.pop()
        self.refresh_list()

    def refresh_list(self):
        self.listbox.delete(0, tk.END)
        for i, item in enumerate(self.history):
            self.listbox.insert(tk.END, f"{i+1}. {item['display']}")

    def _on_listbox_click(self, event):
        """单击listbox时捕获当前焦点（在listbox获取焦点之前）"""
        self._clicked_focus = self.winfo_toplevel().focus_get()

    def on_double_click(self, event):
        selection = self.listbox.curselection()
        if not selection:
            return
        idx = selection[0]
        text = self.history[idx]["full"]
        # 优先使用track_focus记录的焦点，其次用单击前捕获的焦点，最后用当前焦点
        focused = utils.LAST_FOCUSED_WIDGET
        if focused is None:
            focused = self._clicked_focus
        if focused is None:
            focused = self.winfo_toplevel().focus_get()
        if focused and isinstance(focused, (tk.Entry, tk.Text)):
            try:
                if isinstance(focused, tk.Entry):
                    if focused.selection_present():
                        focused.delete(tk.SEL_FIRST, tk.SEL_LAST)
                    focused.insert(tk.INSERT, text)
                elif isinstance(focused, tk.Text):
                    if focused.tag_ranges(tk.SEL):
                        focused.delete(tk.SEL_FIRST, tk.SEL_LAST)
                    focused.insert(tk.INSERT, text)
                # 粘贴后把焦点还给录入框，这样下次双击还能接着粘贴
                focused.focus_set()
            except Exception:
                pass
        else:
            pyperclip.copy(text)
            from tkinter import messagebox
            messagebox.showinfo("提示", "内容已复制到系统剪贴板，请手动粘贴到目标位置")

    def clear_history(self):
        self.history = []
        self.refresh_list()


# ==================== 分配方案视图 ====================

class DistributionView(tk.Frame):
    def __init__(self, parent, **kwargs):
        super().__init__(parent, **kwargs)

        # 回调函数（由Controller设置）
        self.on_add_case = None
        self.on_save_edit = None
        self.on_delete_case = None
        self.on_clear_form = None
        self.on_clear_case_list = None
        self.on_import_excel = None
        self.on_import_from_db = None
        self.on_export_excel = None
        self.on_generate_doc = None
        self.on_set_total_amount = None
        self.on_case_selected = None
        self.on_tree_select = None

        self.selected_idx = None

        self.build_ui()
        self.refresh_case_selector()

    def build_ui(self):
        """构建界面"""
        # 左右分栏
        self.paned = tk.PanedWindow(self, orient=tk.HORIZONTAL)
        self.paned.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)

        # 左侧：输入区域
        left_frame = tk.LabelFrame(self.paned, text="案件信息录入", font=("仿宋", 12, "bold"))
        self.paned.add(left_frame, width=380)

        # ========== 案件库查询行 ==========
        db_frame = tk.Frame(left_frame, bg="#e8f4fd")
        db_frame.pack(fill=tk.X, padx=5, pady=5)

        tk.Label(db_frame, text="案件库:", font=("仿宋", 11, "bold"), bg="#e8f4fd").pack(side=tk.LEFT, padx=2)
        self.case_selector = ttk.Combobox(db_frame, values=[], width=18, font=("仿宋", 11), state="readonly")
        self.case_selector.pack(side=tk.LEFT, padx=2)
        self.case_selector.bind("<FocusIn>", track_focus)
        self.case_selector.bind("<<ComboboxSelected>>", self._on_case_selected)

        # 表单
        form_frame = tk.Frame(left_frame)
        form_frame.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)

        fields = [
            ("案号", "case_no", "text"),
            ("债权人", "creditor", "text"),
            ("债务人", "debtor", "text"),
            ("证件号", "id_card", "text"),
            ("执行依据", "exec_basis", "text"),
            ("案由", "case_reason", "text"),
            ("本金(元)", "principal", "money"),
            ("利息(元)", "interest", "money"),
            ("诉讼费(元)", "litigation_fee", "money"),
            ("债权类型", "claim_type", "combo"),
        ]

        self.form_vars = {}
        self.form_widgets = {}

        for i, (label, key, wtype) in enumerate(fields):
            tk.Label(form_frame, text=label + ":", font=("仿宋", 11),
                    anchor="e").grid(row=i, column=0, sticky="e", padx=5, pady=3)

            if wtype == "combo":
                var = tk.StringVar(value="第一顺位")
                widget = ttk.Combobox(form_frame, textvariable=var,
                                     values=["第一顺位", "第二顺位", "第三顺位", "第四顺位"],
                                     state="readonly", width=18, font=("仿宋", 11))
                widget.bind("<FocusIn>", track_focus)
            elif wtype == "money":
                var = tk.StringVar()
                widget = tk.Entry(form_frame, textvariable=var, font=("Arial", 11), width=20)
                widget.bind("<FocusIn>", track_focus)
            else:
                var = tk.StringVar()
                widget = tk.Entry(form_frame, textvariable=var, font=("仿宋", 11), width=20)
                widget.bind("<FocusIn>", track_focus)

            widget.grid(row=i, column=1, sticky="w", padx=5, pady=3)
            self.form_vars[key] = var
            self.form_widgets[key] = widget

        # 按钮区域
        btn_frame_outer = tk.Frame(left_frame)
        btn_frame_outer.pack(fill=tk.X, padx=5, pady=5)

        btn_frame_outer.columnconfigure(0, weight=1)
        btn_frame_outer.columnconfigure(1, weight=1)
        btn_frame_outer.columnconfigure(2, weight=1)
        btn_frame_outer.columnconfigure(3, weight=1)
        btn_frame_outer.columnconfigure(4, weight=1)

        tk.Button(btn_frame_outer, text="添加案件", font=("仿宋", 10),
                 command=self._on_add_case, bg="#4a90d9", fg="white").grid(row=0, column=0, padx=3, pady=3, sticky="ew")
        tk.Button(btn_frame_outer, text="保存修改", font=("仿宋", 10),
                 command=self._on_save_edit, bg="#5cb85c", fg="white").grid(row=0, column=1, padx=3, pady=3, sticky="ew")
        tk.Button(btn_frame_outer, text="删除案件", font=("仿宋", 10),
                 command=self._on_delete_case, bg="#d9534f", fg="white").grid(row=0, column=2, padx=3, pady=3, sticky="ew")
        tk.Button(btn_frame_outer, text="清空表单", font=("仿宋", 10),
                 command=self._on_clear_form, bg="#f0ad4e").grid(row=0, column=3, padx=3, pady=3, sticky="ew")
        tk.Button(btn_frame_outer, text="清空列表", font=("仿宋", 10),
                 command=self._on_clear_case_list, bg="#d9534f", fg="white").grid(row=0, column=4, padx=3, pady=3, sticky="ew")

        # 第二行功能按钮
        btn_frame_outer2 = tk.Frame(left_frame)
        btn_frame_outer2.pack(fill=tk.X, padx=5, pady=2)
        btn_frame_outer2.columnconfigure(0, weight=1)
        btn_frame_outer2.columnconfigure(1, weight=1)
        btn_frame_outer2.columnconfigure(2, weight=1)
        btn_frame_outer2.columnconfigure(3, weight=1)

        tk.Button(btn_frame_outer2, text="导入Excel", font=("仿宋", 10),
                 command=self._on_import_excel, bg="#5bc0de").grid(row=0, column=0, padx=3, pady=3, sticky="ew")
        tk.Button(btn_frame_outer2, text="从库导入", font=("仿宋", 10),
                 command=self._on_import_from_db, bg="#337ab7", fg="white").grid(row=0, column=1, padx=3, pady=3, sticky="ew")
        tk.Button(btn_frame_outer2, text="导出Excel", font=("仿宋", 10),
                 command=self._on_export_excel, bg="#5cb85c", fg="white").grid(row=0, column=2, padx=3, pady=3, sticky="ew")
        tk.Button(btn_frame_outer2, text="生成文档", font=("仿宋", 10),
                 command=self._on_generate_doc, bg="#337ab7", fg="white").grid(row=0, column=3, padx=3, pady=3, sticky="ew")

        # 右侧：列表和结果
        right_frame = tk.Frame(self.paned)
        self.paned.add(right_frame, width=600)

        # 分配金额设置
        amount_frame = tk.Frame(right_frame)
        amount_frame.pack(fill=tk.X, padx=5, pady=5)

        tk.Label(amount_frame, text="本次可分配总金额(元):", font=("仿宋", 12, "bold")).pack(side=tk.LEFT)
        self.total_var = tk.StringVar()
        total_entry = tk.Entry(amount_frame, textvariable=self.total_var, font=("Arial", 12), width=15)
        total_entry.pack(side=tk.LEFT, padx=5)
        total_entry.bind("<FocusIn>", track_focus)
        tk.Button(amount_frame, text="设置金额", font=("仿宋", 11),
                 command=self._on_set_total_amount, bg="#f0ad4e").pack(side=tk.LEFT, padx=5)

        self.total_label = tk.Label(amount_frame, text="当前: 0.00元", font=("仿宋", 11), fg="red")
        self.total_label.pack(side=tk.LEFT, padx=10)

        # 案件列表
        list_frame = tk.LabelFrame(right_frame, text="案件列表", font=("仿宋", 12, "bold"))
        list_frame.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)

        columns = ("编号", "案号", "债权人", "证件号", "债务人", "执行依据",
                  "案由", "本金", "利息", "诉讼费", "债权类型")
        self.tree = ttk.Treeview(list_frame, columns=columns, show="headings", height=12)

        col_widths = [40, 100, 80, 120, 80, 100, 80, 80, 80, 60, 80]
        for col, width in zip(columns, col_widths):
            self.tree.heading(col, text=col)
            self.tree.column(col, width=width, anchor="center")

        vsb = ttk.Scrollbar(list_frame, orient=tk.VERTICAL, command=self.tree.yview)
        hsb = ttk.Scrollbar(list_frame, orient=tk.HORIZONTAL, command=self.tree.xview)
        self.tree.configure(yscrollcommand=vsb.set, xscrollcommand=hsb.set)

        self.tree.grid(row=0, column=0, sticky="nsew")
        vsb.grid(row=0, column=1, sticky="ns")
        hsb.grid(row=1, column=0, sticky="ew")

        list_frame.grid_rowconfigure(0, weight=1)
        list_frame.grid_columnconfigure(0, weight=1)

        self.tree.bind("<<TreeviewSelect>>", self._on_tree_select)

        # 分配结果预览
        result_frame = tk.LabelFrame(right_frame, text="分配结果预览", font=("仿宋", 12, "bold"))
        result_frame.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)

        self.result_text = tk.Text(result_frame, font=("仿宋", 11), height=8, wrap=tk.WORD)
        result_scroll = tk.Scrollbar(result_frame, command=self.result_text.yview)
        self.result_text.config(yscrollcommand=result_scroll.set)

        self.result_text.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        result_scroll.pack(side=tk.RIGHT, fill=tk.Y)
        self.result_text.bind("<FocusIn>", track_focus)

    # ---------- 回调包装 ----------

    def _on_add_case(self):
        if self.on_add_case:
            self.on_add_case()

    def _on_save_edit(self):
        if self.on_save_edit:
            self.on_save_edit()

    def _on_delete_case(self):
        if self.on_delete_case:
            self.on_delete_case()

    def _on_clear_form(self):
        if self.on_clear_form:
            self.on_clear_form()

    def _on_clear_case_list(self):
        if self.on_clear_case_list:
            self.on_clear_case_list()

    def _on_import_excel(self):
        if self.on_import_excel:
            self.on_import_excel()

    def _on_import_from_db(self):
        if self.on_import_from_db:
            self.on_import_from_db()

    def _on_export_excel(self):
        if self.on_export_excel:
            self.on_export_excel()

    def _on_generate_doc(self):
        if self.on_generate_doc:
            self.on_generate_doc()

    def _on_set_total_amount(self):
        if self.on_set_total_amount:
            self.on_set_total_amount()

    def _on_case_selected(self, event=None):
        if self.on_case_selected:
            self.on_case_selected(event)

    def _on_tree_select(self, event):
        selection = self.tree.selection()
        if not selection:
            return
        item = self.tree.item(selection[0])
        values = item["values"]
        if not values:
            return
        idx = values[0] - 1
        if idx < 0:
            return
        self.selected_idx = idx
        if self.on_tree_select:
            self.on_tree_select(idx)

    # ---------- 供Controller调用的方法 ----------

    def refresh_case_selector(self):
        """刷新案件选择下拉框"""
        self.case_selector.config(values=get_all_case_nos())

    def get_form_data(self):
        """获取表单数据字典"""
        case_no = self.form_vars["case_no"].get().strip()
        creditor = self.form_vars["creditor"].get().strip()
        debtor = self.form_vars["debtor"].get().strip()
        id_card = self.form_vars["id_card"].get().strip()
        exec_basis = self.form_vars["exec_basis"].get().strip()
        case_reason = self.form_vars["case_reason"].get().strip()

        if not case_no:
            from tkinter import messagebox
            messagebox.showwarning("提示", "案号不能为空")
            return None

        return {
            "case_no": case_no,
            "creditor": creditor or "",
            "debtor": debtor or "",
            "id_card": id_card or "",
            "exec_basis": exec_basis or "",
            "case_reason": case_reason or "",
            "principal": parse_money(self.form_vars["principal"].get()),
            "interest": parse_money(self.form_vars["interest"].get()),
            "litigation_fee": parse_money(self.form_vars["litigation_fee"].get()),
            "claim_type": self.form_vars["claim_type"].get() or "第一顺位",
        }

    def fill_form(self, data):
        """用字典数据回填表单"""
        self.form_vars["case_no"].set(data.get("case_no", ""))
        self.form_vars["creditor"].set(data.get("creditor", ""))
        self.form_vars["debtor"].set(data.get("debtor", ""))
        self.form_vars["id_card"].set(data.get("id_card", ""))
        self.form_vars["exec_basis"].set(data.get("exec_basis", ""))
        self.form_vars["case_reason"].set(data.get("case_reason", ""))

        calc_result = data.get("calc_result", {})
        if calc_result:
            principal = round(calc_result.get("total_remaining_principal", 0) +
                            calc_result.get("remaining_other", 0), 2)
            interest = round(calc_result.get("total_remaining_interest", 0), 2)
            litigation_fee = round(calc_result.get("remaining_litigation", 0), 2)

            self.form_vars["principal"].set(str(principal))
            self.form_vars["interest"].set(str(interest))
            self.form_vars["litigation_fee"].set(str(litigation_fee))
        else:
            self.form_vars["principal"].set(str(round(data.get("principal", 0), 2)))
            self.form_vars["interest"].set(str(round(data.get("interest", 0), 2)))
            self.form_vars["litigation_fee"].set(str(round(data.get("litigation_fee", 0), 2)))

        self.form_vars["claim_type"].set(data.get("claim_type", "第一顺位"))

    def clear_form(self):
        """清空表单"""
        for key, var in self.form_vars.items():
            if key == "claim_type":
                var.set("第一顺位")
            else:
                var.set("")
        self.selected_idx = None
        self.tree.selection_remove(self.tree.selection())

    # 单独的getter/setter，兼容Controller调用
    def get_form_case_no(self): return self.form_vars["case_no"].get()
    def set_form_case_no(self, v): self.form_vars["case_no"].set(v)
    def get_form_creditor(self): return self.form_vars["creditor"].get()
    def set_form_creditor(self, v): self.form_vars["creditor"].set(v)
    def get_form_debtor(self): return self.form_vars["debtor"].get()
    def set_form_debtor(self, v): self.form_vars["debtor"].set(v)
    def get_form_id_card(self): return self.form_vars["id_card"].get()
    def set_form_id_card(self, v): self.form_vars["id_card"].set(v)
    def get_form_exec_basis(self): return self.form_vars["exec_basis"].get()
    def set_form_exec_basis(self, v): self.form_vars["exec_basis"].set(v)
    def get_form_case_reason(self): return self.form_vars["case_reason"].get()
    def set_form_case_reason(self, v): self.form_vars["case_reason"].set(v)
    def get_form_principal(self): return self.form_vars["principal"].get()
    def set_form_principal(self, v): self.form_vars["principal"].set(v)
    def get_form_interest(self): return self.form_vars["interest"].get()
    def set_form_interest(self, v): self.form_vars["interest"].set(v)
    def get_form_litigation_fee(self): return self.form_vars["litigation_fee"].get()
    def set_form_litigation_fee(self, v): self.form_vars["litigation_fee"].set(v)
    def get_form_claim_type(self): return self.form_vars["claim_type"].get()
    def set_form_claim_type(self, v): self.form_vars["claim_type"].set(v)

    def refresh_tree(self, cases):
        """刷新treeview"""
        for item in self.tree.get_children():
            self.tree.delete(item)
        for case in cases:
            self.tree.insert("", tk.END, values=(
                case["id"], case["case_no"], case["creditor"], case["id_card"],
                case["debtor"], case["exec_basis"], case["case_reason"],
                format_money(case["principal"]), format_money(case["interest"]),
                format_money(case["litigation_fee"]), case["claim_type"],
            ))

    def clear_tree(self):
        """清空treeview"""
        for item in self.tree.get_children():
            self.tree.delete(item)

    def add_tree_row(self, values):
        """添加一行到treeview"""
        self.tree.insert("", tk.END, values=values)

    def set_total_amount_display(self, amount_str):
        """设置总金额显示"""
        self.total_label.config(text=f"当前: {amount_str}元")

    def set_result_text(self, text):
        """设置结果预览文本"""
        self.result_text.delete("1.0", tk.END)
        self.result_text.insert(tk.END, text)

    def get_selected_case_idx(self):
        """获取选中的案件索引"""
        return self.selected_idx

    # 别名，兼容Controller调用
    def get_selected_idx(self):
        return self.selected_idx

    def set_selected_idx(self, idx):
        self.selected_idx = idx
        if idx is None:
            self.tree.selection_remove(self.tree.selection())

    def set_total_amount_text(self, text):
        self.total_var.set(text)

    def set_total_label(self, text):
        self.total_label.config(text=text)

    def get_total_amount_text(self):
        return self.total_var.get()

    def get_total_amount_input(self):
        """获取总金额输入"""
        return self.total_var.get()

    def get_case_selector_value(self):
        """获取案件选择器的值"""
        return self.case_selector.get()

    def set_case_selector_values(self, values, selected_value=""):
        self.case_selector.config(values=values)
        if selected_value:
            self.case_selector.set(selected_value)


# ==================== 利息计算视图 ====================

class InterestView(tk.Frame):
    def __init__(self, parent, **kwargs):
        super().__init__(parent, **kwargs)

        # 回调函数（由Controller设置）
        self.on_calculate = None
        self.on_save_to_db = None
        self.on_export_excel = None
        self.on_import_excel = None
        self.on_copy_preview = None
        self.on_manage_lpr = None
        self.on_clear = None
        self.on_case_selected = None
        self.on_add_claim = None
        self.on_add_payment = None
        self.on_delete_from_db = None
        self.on_data_changed = None
        self.on_search = None
        self.on_toggle_search = None

        # 数据存储
        self.claims = []
        self.payments = []
        self.claim_frames = []
        self.payment_frames = []

        # 状态追踪
        self.calc_result = None
        self.is_saved = False
        self.loaded_case_no = None
        self._unsaved_changes = False

        self.build_ui()
        self.refresh_case_selector()

    def build_ui(self):
        self.main_canvas = tk.Canvas(self)
        scrollbar = ttk.Scrollbar(self, orient=tk.VERTICAL, command=self.main_canvas.yview)
        self.main_canvas.configure(yscrollcommand=scrollbar.set)

        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        self.main_canvas.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)

        self.content_frame = tk.Frame(self.main_canvas)
        self.canvas_window = self.main_canvas.create_window((0, 0), window=self.content_frame, anchor="nw")

        self.content_frame.bind("<Configure>", lambda e: self.main_canvas.configure(scrollregion=self.main_canvas.bbox("all")))
        self.main_canvas.bind("<Configure>", lambda e: self.main_canvas.itemconfig(self.canvas_window, width=e.width))

        # 绑定鼠标滚轮事件
        self.main_canvas.bind_all("<MouseWheel>", self._on_mousewheel)
        self.main_canvas.bind_all("<Button-4>", self._on_mousewheel_linux)
        self.main_canvas.bind_all("<Button-5>", self._on_mousewheel_linux)

        # ========== 案件库查询行 ==========
        db_frame = tk.Frame(self.content_frame, bg="#e8f4fd")
        db_frame.pack(fill=tk.X, padx=5, pady=5)

        tk.Label(db_frame, text="案件库:", font=("仿宋", 11, "bold"), bg="#e8f4fd").pack(side=tk.LEFT, padx=2)
        self.case_selector = ttk.Combobox(db_frame, values=[], width=18, font=("仿宋", 11), state="readonly")
        self.case_selector.pack(side=tk.LEFT, padx=2)
        self.case_selector.bind("<FocusIn>", track_focus)
        self.case_selector.bind("<<ComboboxSelected>>", self._on_case_selected)
        # 案件库下拉框：滚轮仅用于查看内容，不选择；下拉打开时只控制下拉框滚动
        self._case_dropdown_open = False
        self.case_selector.bind("<Button-1>", self._on_case_selector_click)
        self.case_selector.bind("<<ComboboxSelected>>", self._on_case_dropdown_close, add="+")
        self.case_selector.bind("<Escape>", self._on_case_dropdown_close)
        # 禁止滚轮选择案件（滚轮不改变选中项）
        self.case_selector.bind("<MouseWheel>", self._on_case_wheel)
        self.case_selector.bind("<Button-4>", self._on_case_wheel_linux)
        self.case_selector.bind("<Button-5>", self._on_case_wheel_linux)

        # 检索输入框（默认隐藏）
        self.search_entry = tk.Entry(db_frame, font=("仿宋", 11), width=20)
        self.search_entry.bind("<FocusIn>", track_focus)
        self.search_entry.bind("<Return>", self._on_search)
        self.search_entry.bind("<KP_Enter>", self._on_search)

        self.search_btn = tk.Button(db_frame, text="检索", font=("仿宋", 10), command=self._on_toggle_search, bg="#5bc0de")
        self.search_btn.pack(side=tk.LEFT, padx=2)
        tk.Button(db_frame, text="删除", font=("仿宋", 10), command=self._on_delete_from_db, bg="#d9534f", fg="white").pack(side=tk.LEFT, padx=2)
        tk.Button(db_frame, text="保存到库", font=("仿宋", 10), command=self._on_save_to_db, bg="#5cb85c", fg="white").pack(side=tk.LEFT, padx=2)
        tk.Button(db_frame, text="导出Excel", font=("仿宋", 10), command=self._on_export_excel, bg="#f0ad4e").pack(side=tk.LEFT, padx=2)
        tk.Button(db_frame, text="导入Excel", font=("仿宋", 10), command=self._on_import_excel, bg="#5bc0de").pack(side=tk.LEFT, padx=2)

        # ========== 基本信息区域 ==========
        basic_frame = tk.LabelFrame(self.content_frame, text="案件基本信息", font=("仿宋", 12, "bold"))
        basic_frame.pack(fill=tk.X, padx=5, pady=5)

        basic_grid = tk.Frame(basic_frame)
        basic_grid.pack(padx=5, pady=5)

        # 第0行：案号 | 申请执行人
        tk.Label(basic_grid, text="案号:", font=("仿宋", 11), anchor="e").grid(row=0, column=0, sticky="e", padx=5, pady=3)
        self.case_no_var = tk.StringVar()
        self.case_no_var.trace("w", self._on_data_changed)
        case_no_entry = tk.Entry(basic_grid, textvariable=self.case_no_var, font=("仿宋", 11), width=25)
        case_no_entry.grid(row=0, column=1, sticky="w", padx=5, pady=3)
        case_no_entry.bind("<FocusIn>", track_focus)

        tk.Label(basic_grid, text="申请执行人:", font=("仿宋", 11), anchor="e").grid(row=0, column=2, sticky="e", padx=5, pady=3)
        self.creditor_var = tk.StringVar()
        self.creditor_var.trace("w", self._on_data_changed)
        creditor_entry = tk.Entry(basic_grid, textvariable=self.creditor_var, font=("仿宋", 11), width=20)
        creditor_entry.grid(row=0, column=3, sticky="w", padx=5, pady=3)
        creditor_entry.bind("<FocusIn>", track_focus)

        # 第1行：案由 | 被执行人
        tk.Label(basic_grid, text="案由:", font=("仿宋", 11), anchor="e").grid(row=1, column=0, sticky="e", padx=5, pady=3)
        self.case_reason_var = tk.StringVar()
        self.case_reason_var.trace("w", self._on_data_changed)
        case_reason_entry = tk.Entry(basic_grid, textvariable=self.case_reason_var, font=("仿宋", 11), width=25)
        case_reason_entry.grid(row=1, column=1, sticky="w", padx=5, pady=3)
        case_reason_entry.bind("<FocusIn>", track_focus)

        tk.Label(basic_grid, text="被执行人:", font=("仿宋", 11), anchor="e").grid(row=1, column=2, sticky="e", padx=5, pady=3)
        self.debtor_var = tk.StringVar()
        self.debtor_var.trace("w", self._on_data_changed)
        debtor_entry = tk.Entry(basic_grid, textvariable=self.debtor_var, font=("仿宋", 11), width=20)
        debtor_entry.grid(row=1, column=3, sticky="w", padx=5, pady=3)
        debtor_entry.bind("<FocusIn>", track_focus)

        # 第2行：证件号 | 执行依据
        tk.Label(basic_grid, text="证件号:", font=("仿宋", 11), anchor="e").grid(row=2, column=0, sticky="e", padx=5, pady=3)
        self.id_card_var = tk.StringVar()
        self.id_card_var.trace("w", self._on_data_changed)
        id_card_entry = tk.Entry(basic_grid, textvariable=self.id_card_var, font=("仿宋", 11), width=25)
        id_card_entry.grid(row=2, column=1, sticky="w", padx=5, pady=3)
        id_card_entry.bind("<FocusIn>", track_focus)

        tk.Label(basic_grid, text="执行依据:", font=("仿宋", 11), anchor="e").grid(row=2, column=2, sticky="e", padx=5, pady=3)
        self.exec_basis_var = tk.StringVar()
        self.exec_basis_var.trace("w", self._on_data_changed)
        exec_basis_entry = tk.Entry(basic_grid, textvariable=self.exec_basis_var, font=("仿宋", 11), width=20)
        exec_basis_entry.grid(row=2, column=3, sticky="w", padx=5, pady=3)
        exec_basis_entry.bind("<FocusIn>", track_focus)

        # 第3行：其他费用 | 诉讼费用
        tk.Label(basic_grid, text="其他费用(元):", font=("仿宋", 11), anchor="e").grid(row=3, column=0, sticky="e", padx=5, pady=3)
        self.other_fees_var = tk.StringVar()
        self.other_fees_var.trace("w", self._on_data_changed)
        other_fees_entry = tk.Entry(basic_grid, textvariable=self.other_fees_var, font=("Arial", 11), width=25)
        other_fees_entry.grid(row=3, column=1, sticky="w", padx=5, pady=3)
        other_fees_entry.bind("<FocusIn>", track_focus)

        tk.Label(basic_grid, text="诉讼费用(元):", font=("仿宋", 11), anchor="e").grid(row=3, column=2, sticky="e", padx=5, pady=3)
        self.litigation_fee_var = tk.StringVar()
        self.litigation_fee_var.trace("w", self._on_data_changed)
        litigation_fee_entry = tk.Entry(basic_grid, textvariable=self.litigation_fee_var, font=("Arial", 11), width=20)
        litigation_fee_entry.grid(row=3, column=3, sticky="w", padx=5, pady=3)
        litigation_fee_entry.bind("<FocusIn>", track_focus)

        # 第4行：利息主张 | 履行期限届满之日
        tk.Label(basic_grid, text="利息主张(元):", font=("仿宋", 11), anchor="e").grid(row=4, column=0, sticky="e", padx=5, pady=3)
        self.interest_claim_var = tk.StringVar()
        self.interest_claim_var.trace("w", self._on_data_changed)
        interest_claim_entry = tk.Entry(basic_grid, textvariable=self.interest_claim_var, font=("Arial", 11), width=25)
        interest_claim_entry.grid(row=4, column=1, sticky="w", padx=5, pady=3)
        interest_claim_entry.bind("<FocusIn>", track_focus)

        tk.Label(basic_grid, text="履行期限届满之日:", font=("仿宋", 11), anchor="e").grid(row=4, column=2, sticky="e", padx=5, pady=3)
        self.due_date_var = tk.StringVar(value=datetime.now().strftime("%Y-%m-%d"))
        self.due_date_var.trace("w", self._on_data_changed)
        self.due_date_frame, self.due_date_entry = create_date_entry(
            basic_grid, self.due_date_var, width=15, entry_font=("Arial", 11))
        self.due_date_frame.grid(row=4, column=3, sticky="w", padx=5, pady=3)

        # ========== 债权列表区域 ==========
        claims_frame = tk.LabelFrame(self.content_frame, text="债权明细（一般债务利息）", font=("仿宋", 12, "bold"))
        claims_frame.pack(fill=tk.X, padx=5, pady=5)

        self.claims_container = tk.Frame(claims_frame)
        self.claims_container.pack(fill=tk.X, padx=5, pady=5)

        header = tk.Frame(self.claims_container, bg="#e8f4fd")
        header.pack(fill=tk.X)
        headers = [("序号", 5), ("本金(元)", 15), ("利率类型", 22), ("LPR倍率(%)", 12), ("固定利率(%)", 12), ("一年天数", 8), ("起算之日", 15), ("结算之日", 15), ("操作", 8)]
        for text, width in headers:
            tk.Label(header, text=text, font=("仿宋", 10, "bold"), bg="#e8f4fd", width=width).pack(side=tk.LEFT, padx=2)

        tk.Button(claims_frame, text="+ 添加债权", font=("仿宋", 11), command=self._on_add_claim,
                 bg="#4a90d9", fg="white").pack(anchor="w", padx=5, pady=5)

        # 默认添加一行债权
        self.add_claim_row()

        # ========== 清偿记录区域 ==========
        payments_frame = tk.LabelFrame(self.content_frame, text="部分清偿记录", font=("仿宋", 12, "bold"))
        payments_frame.pack(fill=tk.X, padx=5, pady=5)

        self.payments_container = tk.Frame(payments_frame)
        self.payments_container.pack(fill=tk.X, padx=5, pady=5)

        pay_header = tk.Frame(self.payments_container, bg="#fff3cd")
        pay_header.pack(fill=tk.X)
        pay_headers = [("序号", 5), ("清偿金额(元)", 15), ("清偿时间", 15), ("抵扣顺序", 40), ("操作", 8)]
        for text, width in pay_headers:
            tk.Label(pay_header, text=text, font=("仿宋", 10, "bold"), bg="#fff3cd", width=width).pack(side=tk.LEFT, padx=2)

        tk.Button(payments_frame, text="+ 添加清偿记录", font=("仿宋", 11), command=self._on_add_payment,
                 bg="#f0ad4e", fg="white").pack(anchor="w", padx=5, pady=5)

        # ========== 操作按钮 ==========
        btn_frame = tk.Frame(self.content_frame)
        btn_frame.pack(fill=tk.X, padx=5, pady=10)

        tk.Button(btn_frame, text="计算利息", font=("仿宋", 12),
                 command=self._on_calculate, bg="#4a90d9", fg="white").pack(side=tk.LEFT, padx=5)
        tk.Button(btn_frame, text="复制预览", font=("仿宋", 12),
                 command=self._on_copy_preview, bg="#337ab7", fg="white").pack(side=tk.LEFT, padx=5)
        tk.Button(btn_frame, text="管理LPR", font=("仿宋", 12),
                 command=self._on_manage_lpr, bg="#5cb85c", fg="white").pack(side=tk.LEFT, padx=5)
        tk.Button(btn_frame, text="清空全部", font=("仿宋", 12),
                 command=self._on_clear).pack(side=tk.LEFT, padx=5)

        # ========== 计算结果预览 ==========
        result_frame = tk.LabelFrame(self.content_frame, text="计算结果预览", font=("仿宋", 12, "bold"))
        result_frame.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)

        self.result_text = tk.Text(result_frame, font=("仿宋", 11), wrap=tk.WORD, height=30)
        result_scroll = tk.Scrollbar(result_frame, command=self.result_text.yview)
        self.result_text.config(yscrollcommand=result_scroll.set)

        self.result_text.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=5, pady=5)
        result_scroll.pack(side=tk.RIGHT, fill=tk.Y)
        self.result_text.bind("<FocusIn>", track_focus)

    # ---------- 鼠标滚轮处理 ----------

    def _on_mousewheel(self, event):
        """Windows 鼠标滚轮"""
        if str(self) != self.master.select():
            return

        # 检测事件来源：如果是下拉列表的Listbox，只滚下拉列表，不滚窗口
        widget = event.widget
        if isinstance(widget, tk.Listbox):
            try:
                if widget.master.winfo_class() == 'Toplevel':
                    delta = int(-1 * (event.delta / 120))
                    widget.yview_scroll(delta, "units")
                    return "break"
            except Exception:
                pass

        # 如果案件库下拉框打开中，关闭它再滚动（主流网站：外部滚动即关闭下拉框）
        if self._case_dropdown_open:
            self._case_dropdown_open = False

        canvas_yview = self.main_canvas.yview()
        canvas_at_bottom = (canvas_yview[1] >= 1.0)
        canvas_at_top = (canvas_yview[0] <= 0.0)

        result_yview = self.result_text.yview()
        result_at_bottom = (result_yview[1] >= 1.0)
        result_at_top = (result_yview[0] <= 0.0)

        delta = int(-1 * (event.delta / 120))
        going_down = event.delta < 0

        if going_down:
            if not canvas_at_bottom:
                self.main_canvas.yview_scroll(delta, "units")
            elif not result_at_bottom:
                self.result_text.yview_scroll(delta, "units")
        else:
            if not result_at_top:
                self.result_text.yview_scroll(delta, "units")
            elif not canvas_at_top:
                self.main_canvas.yview_scroll(delta, "units")

        return "break"

    def _on_mousewheel_linux(self, event):
        """Linux 鼠标滚轮"""
        if str(self) != self.master.select():
            return

        # 检测事件来源：如果是下拉列表的Listbox，只滚下拉列表，不滚窗口
        widget = event.widget
        if isinstance(widget, tk.Listbox):
            try:
                if widget.master.winfo_class() == 'Toplevel':
                    if event.num == 5:
                        widget.yview_scroll(1, "units")
                    elif event.num == 4:
                        widget.yview_scroll(-1, "units")
                    return "break"
            except Exception:
                pass

        if self._case_dropdown_open:
            self._case_dropdown_open = False

        canvas_yview = self.main_canvas.yview()
        canvas_at_bottom = (canvas_yview[1] >= 1.0)
        canvas_at_top = (canvas_yview[0] <= 0.0)

        result_yview = self.result_text.yview()
        result_at_bottom = (result_yview[1] >= 1.0)
        result_at_top = (result_yview[0] <= 0.0)

        if event.num == 5:
            if not canvas_at_bottom:
                self.main_canvas.yview_scroll(1, "units")
            elif not result_at_bottom:
                self.result_text.yview_scroll(1, "units")
            return "break"
        elif event.num == 4:
            if not result_at_top:
                self.result_text.yview_scroll(-1, "units")
            elif not canvas_at_top:
                self.main_canvas.yview_scroll(-1, "units")
            return "break"

    # ---------- 回调包装 ----------

    def _on_case_selector_click(self, event=None):
        """案件库下拉框被点击，标记下拉框为打开状态"""
        self._case_dropdown_open = True
        # 延迟绑定下拉列表的滚轮事件（下拉列表是动态创建的Toplevel）
        self.after(100, self._bind_dropdown_listbox_wheel)
        # 延迟检查：如果下拉框关闭了（再次点击或选择后），重置状态
        self.after(200, self._check_dropdown_closed)

    def _bind_dropdown_listbox_wheel(self):
        """绑定下拉列表Listbox的滚轮事件，防止滚轮选择案件"""
        if not self._case_dropdown_open:
            return
        try:
            for child in self.winfo_toplevel().winfo_children():
                if child.winfo_class() == 'Toplevel' and child.winfo_viewable():
                    for sub in child.winfo_children():
                        if sub.winfo_class() == 'Listbox':
                            sub.bind("<MouseWheel>", self._on_dropdown_listbox_wheel)
                            sub.bind("<Button-4>", self._on_dropdown_listbox_wheel_linux)
                            sub.bind("<Button-5>", self._on_dropdown_listbox_wheel_linux)
                            return
        except Exception:
            pass

    def _on_dropdown_listbox_wheel(self, event):
        """下拉列表上的滚轮：滚动内容，不改变选择。到底/到顶后关闭下拉框滚页面"""
        try:
            yv = event.widget.yview()
            delta = int(-1 * (event.delta / 120))
            # 判断是否还能继续滚动
            going_down = event.delta < 0
            if going_down and yv[1] >= 1.0:
                # 已到底，关闭下拉框，滚页面
                self._case_dropdown_open = False
                self._on_mousewheel(event)
            elif not going_down and yv[0] <= 0.0:
                # 已到顶，关闭下拉框，滚页面
                self._case_dropdown_open = False
                self._on_mousewheel(event)
            else:
                event.widget.yview_scroll(delta, "units")
        except Exception:
            pass
        return "break"

    def _on_dropdown_listbox_wheel_linux(self, event):
        """下拉列表上的滚轮(Linux)"""
        try:
            yv = event.widget.yview()
            going_down = event.num == 5
            if going_down and yv[1] >= 1.0:
                self._case_dropdown_open = False
                self._on_mousewheel_linux(event)
            elif not going_down and yv[0] <= 0.0:
                self._case_dropdown_open = False
                self._on_mousewheel_linux(event)
            else:
                if event.num == 5:
                    event.widget.yview_scroll(1, "units")
                elif event.num == 4:
                    event.widget.yview_scroll(-1, "units")
        except Exception:
            pass
        return "break"

    def _on_case_dropdown_close(self, event=None):
        """案件库下拉框关闭（选择或ESC）"""
        self._case_dropdown_open = False

    def _on_case_wheel(self, event):
        """案件库Combobox滚轮：不改变选中项。打开时滚下拉列表，关闭时滚页面"""
        if self._case_dropdown_open:
            try:
                for child in self.winfo_toplevel().winfo_children():
                    if child.winfo_class() == 'Toplevel' and child.winfo_viewable():
                        for sub in child.winfo_children():
                            if sub.winfo_class() == 'Listbox':
                                delta = int(-1 * (event.delta / 120))
                                sub.yview_scroll(delta, "units")
                                return "break"
                        break
            except Exception:
                pass
            return "break"
        else:
            self._on_mousewheel(event)
            return "break"

    def _on_case_wheel_linux(self, event):
        """案件库Combobox滚轮(Linux)"""
        if self._case_dropdown_open:
            try:
                for child in self.winfo_toplevel().winfo_children():
                    if child.winfo_class() == 'Toplevel' and child.winfo_viewable():
                        for sub in child.winfo_children():
                            if sub.winfo_class() == 'Listbox':
                                if event.num == 5:
                                    sub.yview_scroll(1, "units")
                                elif event.num == 4:
                                    sub.yview_scroll(-1, "units")
                                return "break"
                        break
            except Exception:
                pass
            return "break"
        else:
            self._on_mousewheel_linux(event)
            return "break"

    def _check_dropdown_closed(self):
        """延迟检查下拉框是否已关闭"""
        # 如果下拉框仍然打开，继续检查
        if self._case_dropdown_open:
            # 检查Combobox的下拉列表是否还存在
            try:
                # 尝试找到下拉列表Toplevel
                for child in self.winfo_toplevel().winfo_children():
                    if child.winfo_class() == 'Toplevel' and child.winfo_viewable():
                        # 下拉列表仍然打开，继续监控
                        self.after(200, self._check_dropdown_closed)
                        return
            except Exception:
                pass
            # 没有找到打开的下拉列表，标记为关闭
            self._case_dropdown_open = False

    def _on_data_changed(self, *args):
        if self.on_data_changed:
            self.on_data_changed()

    def _on_case_selected(self, event=None):
        if self.on_case_selected:
            self.on_case_selected(event)

    def _on_calculate(self):
        if self.on_calculate:
            self.on_calculate()

    def _on_save_to_db(self):
        if self.on_save_to_db:
            self.on_save_to_db()

    def _on_export_excel(self):
        if self.on_export_excel:
            self.on_export_excel()

    def _on_import_excel(self):
        if self.on_import_excel:
            self.on_import_excel()

    def _on_copy_preview(self):
        if self.on_copy_preview:
            self.on_copy_preview()

    def _on_manage_lpr(self):
        if self.on_manage_lpr:
            self.on_manage_lpr()

    def _on_clear(self):
        if self.on_clear:
            self.on_clear()

    def _on_add_claim(self):
        if self.on_add_claim:
            self.on_add_claim()
        else:
            self.add_claim_row()

    def _on_add_payment(self):
        if self.on_add_payment:
            self.on_add_payment()
        else:
            self.add_payment_row()

    def _on_delete_from_db(self):
        if self.on_delete_from_db:
            self.on_delete_from_db()

    def _on_search(self, event=None):
        if self.on_search:
            self.on_search(event)
        return "break"

    def _on_toggle_search(self):
        if self.on_toggle_search:
            self.on_toggle_search()

    # ---------- 债权管理 ----------

    def add_claim_row(self, claim_data=None):
        """添加一行债权输入

        claim_data: 可选的初始数据字典，包含:
            principal, rate_type, lpr_multiple, fixed_rate, days_per_year, start_date, end_date
        """
        idx = len(self.claims)

        default_start = self.due_date_var.get()
        default_end = datetime.now().strftime("%Y-%m-%d")
        if idx > 0 and self.claims:
            default_start = self.claims[-1].get("start_date", tk.StringVar()).get() or default_start
            default_end = self.claims[-1].get("end_date", tk.StringVar()).get() or default_end

        # 如果提供了初始数据，使用初始数据
        if claim_data:
            init_principal = claim_data.get("principal", "")
            init_rate_type = claim_data.get("rate_type", "一年期LPR分段")
            init_lpr_multiple = claim_data.get("lpr_multiple", "100")
            init_fixed_rate = claim_data.get("fixed_rate", "")
            init_days = claim_data.get("days_per_year", "365")
            init_start = claim_data.get("start_date", default_start)
            init_end = claim_data.get("end_date", default_end)
        else:
            init_principal = ""
            init_rate_type = "一年期LPR分段"
            init_lpr_multiple = "100"
            init_fixed_rate = ""
            init_days = "365"
            init_start = default_start
            init_end = default_end

        claim = {
            "principal": tk.StringVar(value=str(init_principal)),
            "rate_type": tk.StringVar(value=init_rate_type),
            "lpr_multiple": tk.StringVar(value=str(init_lpr_multiple)),
            "fixed_rate": tk.StringVar(value=str(init_fixed_rate)),
            "days_per_year": tk.StringVar(value=str(init_days)),
            "start_date": tk.StringVar(value=init_start),
            "end_date": tk.StringVar(value=init_end),
            "widgets": {}
        }

        # 绑定数据变更追踪
        for key in ["principal", "rate_type", "lpr_multiple", "fixed_rate", "days_per_year", "start_date", "end_date"]:
            claim[key].trace("w", self._on_data_changed)

        self.claims.append(claim)

        row = tk.Frame(self.claims_container)
        row.pack(fill=tk.X, pady=2)
        self.claim_frames.append(row)

        # 序号
        seq_label = tk.Label(row, text=str(idx + 1), font=("Arial", 11), width=5)
        seq_label.pack(side=tk.LEFT, padx=2)
        claim["widgets"]["seq_label"] = seq_label

        # 本金输入
        e_principal = tk.Entry(row, textvariable=claim["principal"], font=("Arial", 11), width=15)
        e_principal.pack(side=tk.LEFT, padx=2)
        e_principal.bind("<FocusIn>", track_focus)
        claim["widgets"]["principal"] = e_principal

        # 利率类型选择
        rate_combo = ttk.Combobox(row, textvariable=claim["rate_type"],
                                   values=["一年期LPR分段", "五年期LPR分段", "固定利率"],
                                   state="readonly", width=20, font=("仿宋", 10))
        rate_combo.pack(side=tk.LEFT, padx=2)
        rate_combo.bind("<FocusIn>", track_focus)
        rate_combo.bind("<<ComboboxSelected>>", self._make_rate_change_handler(claim))
        # 禁止滚轮选择利率类型，但允许窗口滚动
        rate_combo.bind("<MouseWheel>", self._make_combo_wheel_handler(rate_combo))
        rate_combo.bind("<Button-4>", self._make_combo_wheel_handler_linux(rate_combo))
        rate_combo.bind("<Button-5>", self._make_combo_wheel_handler_linux(rate_combo))
        claim["widgets"]["rate_type"] = rate_combo

        # LPR倍率输入
        e_lpr = tk.Entry(row, textvariable=claim["lpr_multiple"], font=("Arial", 11), width=12)
        e_lpr.pack(side=tk.LEFT, padx=2)
        e_lpr.bind("<FocusIn>", track_focus)
        claim["widgets"]["lpr_multiple"] = e_lpr

        # 固定利率输入
        e_fixed = tk.Entry(row, textvariable=claim["fixed_rate"], font=("Arial", 11), width=12)
        e_fixed.pack(side=tk.LEFT, padx=2)
        e_fixed.bind("<FocusIn>", track_focus)
        claim["widgets"]["fixed_rate"] = e_fixed

        # 一年天数选择框
        days_combo = ttk.Combobox(row, textvariable=claim["days_per_year"],
                                   values=["365", "360"],
                                   state="readonly", width=6, font=("仿宋", 10))
        days_combo.pack(side=tk.LEFT, padx=2)
        days_combo.bind("<FocusIn>", track_focus)
        # 禁止滚轮选择一年天数，但允许窗口滚动
        days_combo.bind("<MouseWheel>", self._make_combo_wheel_handler(days_combo))
        days_combo.bind("<Button-4>", self._make_combo_wheel_handler_linux(days_combo))
        days_combo.bind("<Button-5>", self._make_combo_wheel_handler_linux(days_combo))
        claim["widgets"]["days_per_year"] = days_combo

        # 起算之日（使用Entry + 按钮替代DateEntry）
        start_date_frame, start_date_entry = create_date_entry(
            row, claim["start_date"], width=11, entry_font=("Arial", 10))
        start_date_frame.pack(side=tk.LEFT, padx=2)
        claim["widgets"]["start_date"] = start_date_entry

        # 结算之日（使用Entry + 按钮替代DateEntry）
        end_date_frame, end_date_entry = create_date_entry(
            row, claim["end_date"], width=11, entry_font=("Arial", 10))
        end_date_frame.pack(side=tk.LEFT, padx=2)
        claim["widgets"]["end_date"] = end_date_entry

        # 删除按钮
        del_btn = tk.Button(row, text="×", font=("Arial", 10),
                           command=self._make_claim_delete_handler(claim),
                           bg="#d9534f", fg="white", width=3)
        del_btn.pack(side=tk.LEFT, padx=2)
        claim["widgets"]["del_btn"] = del_btn

        # 初始化利率类型对应的控件状态
        self._update_rate_type_state(claim)

    def _make_rate_change_handler(self, claim_data):
        """创建利率类型变更处理器"""
        def handler(event):
            self._update_rate_type_state(claim_data)
        return handler

    def _make_combo_wheel_handler(self, combo):
        """创建Combobox滚轮处理器：禁止滚轮改变选项，滚轮只滚页面"""
        def handler(event):
            self._on_mousewheel(event)
            return "break"
        return handler

    def _make_combo_wheel_handler_linux(self, combo):
        """创建Combobox滚轮处理器(Linux)：禁止滚轮改变选项，滚轮只滚页面"""
        def handler(event):
            self._on_mousewheel_linux(event)
            return "break"
        return handler

    def _make_claim_delete_handler(self, claim_data):
        """创建债权删除处理器"""
        def handler():
            self.remove_claim_row_by_data(claim_data)
        return handler

    def _update_rate_type_state(self, claim_data):
        """根据利率类型更新相关控件的启用/禁用状态"""
        rate_type = claim_data["rate_type"].get()
        widgets = claim_data["widgets"]

        if "LPR" in rate_type:
            widgets["lpr_multiple"].config(state="normal")
            widgets["fixed_rate"].config(state="disabled")
        else:
            widgets["lpr_multiple"].config(state="disabled")
            widgets["fixed_rate"].config(state="normal")

    def remove_claim_row_by_data(self, claim_data):
        """通过claim_data引用删除债权"""
        from tkinter import messagebox
        if len(self.claims) <= 1:
            messagebox.showwarning("提示", "至少需要保留一个债权")
            return

        try:
            idx = self.claims.index(claim_data)
        except ValueError:
            return

        self.claim_frames[idx].destroy()
        self.claim_frames.pop(idx)
        self.claims.pop(idx)

        self._renumber_claims()

    def remove_claim_row(self, idx):
        """通过索引删除债权"""
        from tkinter import messagebox
        if len(self.claims) <= 1:
            messagebox.showwarning("提示", "至少需要保留一个债权")
            return

        if idx < 0 or idx >= len(self.claims):
            return

        self.claim_frames[idx].destroy()
        self.claim_frames.pop(idx)
        self.claims.pop(idx)

        self._renumber_claims()

    def _renumber_claims(self):
        """重新编号债权列表"""
        for i, claim_data in enumerate(self.claims):
            seq_label = claim_data["widgets"].get("seq_label")
            if seq_label:
                seq_label.config(text=str(i + 1))

    # ---------- 清偿记录管理 ----------

    def add_payment_row(self, payment_data=None):
        """添加一行清偿记录

        payment_data: 可选的初始数据字典，包含:
            amount, date, deduct_order
        """
        idx = len(self.payments)

        if payment_data:
            init_amount = payment_data.get("amount", "")
            init_date = payment_data.get("date", datetime.now().strftime("%Y-%m-%d"))
            init_deduct_order = payment_data.get("deduct_order", [])
        else:
            init_amount = ""
            init_date = datetime.now().strftime("%Y-%m-%d")
            init_deduct_order = []

        payment = {
            "amount": tk.StringVar(value=str(init_amount)),
            "date": tk.StringVar(value=init_date),
            "deduct_order": init_deduct_order,
            "order_label_var": tk.StringVar(value="默认顺序"),
            "widgets": {}
        }

        # 绑定数据变更追踪
        payment["amount"].trace("w", self._on_data_changed)
        payment["date"].trace("w", self._on_data_changed)

        # 如果有初始抵扣顺序，更新显示
        if init_deduct_order:
            display = " → ".join(init_deduct_order[:3]) + "..." if len(init_deduct_order) > 3 else " → ".join(init_deduct_order)
            payment["order_label_var"].set(display)

        self.payments.append(payment)

        row = tk.Frame(self.payments_container)
        row.pack(fill=tk.X, pady=2)
        self.payment_frames.append(row)

        # 序号
        seq_label = tk.Label(row, text=str(idx + 1), font=("Arial", 11), width=5)
        seq_label.pack(side=tk.LEFT, padx=2)
        payment["widgets"]["seq_label"] = seq_label

        # 清偿金额输入
        amount_entry = tk.Entry(row, textvariable=payment["amount"], font=("Arial", 11), width=15)
        amount_entry.pack(side=tk.LEFT, padx=2)
        amount_entry.bind("<FocusIn>", track_focus)

        # 清偿时间（使用Entry + 按钮替代DateEntry）
        date_frame, date_entry = create_date_entry(
            row, payment["date"], width=11, entry_font=("Arial", 10))
        date_frame.pack(side=tk.LEFT, padx=2)

        # 设置抵扣顺序按钮
        order_btn = tk.Button(row, text="设置抵扣顺序", font=("仿宋", 10),
                             command=self._make_payment_order_handler(payment), bg="#5bc0de")
        order_btn.pack(side=tk.LEFT, padx=2)

        # 抵扣顺序显示
        tk.Label(row, textvariable=payment["order_label_var"], font=("仿宋", 9), fg="#666", width=35).pack(side=tk.LEFT, padx=2)

        # 删除按钮
        del_btn = tk.Button(row, text="×", font=("Arial", 10),
                           command=self._make_payment_delete_handler(payment),
                           bg="#d9534f", fg="white", width=3)
        del_btn.pack(side=tk.LEFT, padx=2)
        payment["widgets"]["del_btn"] = del_btn

    def _make_payment_order_handler(self, payment_data):
        """创建清偿记录设置抵扣顺序处理器"""
        def handler():
            self._show_deduct_order_dialog(payment_data)
        return handler

    def _make_payment_delete_handler(self, payment_data):
        """创建清偿记录删除处理器"""
        def handler():
            self.remove_payment_row_by_data(payment_data)
        return handler

    def _show_deduct_order_dialog(self, payment_data):
        """显示抵扣顺序设置对话框"""
        dialog = tk.Toplevel(self)
        dialog.title("设置抵扣顺序")
        dialog.geometry("450x500")
        dialog.transient(self)
        dialog.grab_set()

        tk.Label(dialog, text="拖拽调整抵扣顺序（从上到下依次抵扣）:", font=("仿宋", 11, "bold")).pack(pady=5)

        listbox = tk.Listbox(dialog, font=("仿宋", 11), height=12)
        listbox.pack(fill=tk.BOTH, expand=True, padx=10, pady=5)

        items = ["诉讼费用"]
        for i in range(len(self.claims)):
            items.append(f"一般债务利息(债权{i+1})")
        for i in range(len(self.claims)):
            items.append(f"债权本金(债权{i+1})")
        items.extend(["其他费用", "延迟履行利息"])

        current_order = payment_data.get("deduct_order", [])
        if current_order and len(current_order) > 0:
            for item in current_order:
                if item in items:
                    listbox.insert(tk.END, item)
            for item in items:
                if item not in current_order:
                    listbox.insert(tk.END, item)
        else:
            for item in items:
                listbox.insert(tk.END, item)

        btn_frame = tk.Frame(dialog)
        btn_frame.pack(pady=5)

        def move_up():
            sel = listbox.curselection()
            if not sel or sel[0] == 0:
                return
            i = sel[0]
            text = listbox.get(i)
            listbox.delete(i)
            listbox.insert(i - 1, text)
            listbox.selection_set(i - 1)

        def move_down():
            sel = listbox.curselection()
            if not sel or sel[0] == listbox.size() - 1:
                return
            i = sel[0]
            text = listbox.get(i)
            listbox.delete(i)
            listbox.insert(i + 1, text)
            listbox.selection_set(i + 1)

        tk.Button(btn_frame, text="↑上移", font=("仿宋", 10), command=move_up).pack(side=tk.LEFT, padx=2)
        tk.Button(btn_frame, text="↓下移", font=("仿宋", 10), command=move_down).pack(side=tk.LEFT, padx=2)

        def save_order():
            order = [listbox.get(i) for i in range(listbox.size())]
            payment_data["deduct_order"] = order
            display = " → ".join(order[:3]) + "..." if len(order) > 3 else " → ".join(order)
            payment_data["order_label_var"].set(display)
            self.mark_unsaved()
            dialog.destroy()

        tk.Button(dialog, text="保存顺序", font=("仿宋", 11), command=save_order,
                 bg="#5cb85c", fg="white").pack(pady=5)

    def remove_payment_row_by_data(self, payment_data):
        """通过数据引用删除清偿记录"""
        try:
            idx = self.payments.index(payment_data)
        except ValueError:
            return

        self.payment_frames[idx].destroy()
        self.payment_frames.pop(idx)
        self.payments.pop(idx)

        self._renumber_payments()

    def remove_payment_row(self, idx):
        """通过索引删除清偿记录"""
        if idx < 0 or idx >= len(self.payments):
            return

        self.payment_frames[idx].destroy()
        self.payment_frames.pop(idx)
        self.payments.pop(idx)

        self._renumber_payments()

    def _renumber_payments(self):
        """重新编号清偿记录列表"""
        for i, payment_data in enumerate(self.payments):
            seq_label = payment_data["widgets"].get("seq_label")
            if seq_label:
                seq_label.config(text=str(i + 1))

    # ---------- 供Controller调用的方法 ----------

    def refresh_case_selector(self):
        """刷新案件选择下拉框"""
        self.case_selector.config(values=get_all_case_nos())

    def get_all_inputs(self):
        """获取所有当前输入值"""
        return {
            "case_no": self.case_no_var.get(),
            "creditor": self.creditor_var.get(),
            "debtor": self.debtor_var.get(),
            "case_reason": self.case_reason_var.get(),
            "id_card": self.id_card_var.get(),
            "exec_basis": self.exec_basis_var.get(),
            "other_fees": self.other_fees_var.get(),
            "litigation_fee": self.litigation_fee_var.get(),
            "interest_claim": self.interest_claim_var.get(),
            "due_date": self.due_date_var.get(),
        }

    def set_claims(self, claims_data):
        """根据数据列表重建债权UI

        claims_data: list of dict, 每个dict包含:
            principal, rate_type, lpr_multiple, fixed_rate, days_per_year, start_date, end_date
        """
        # 清空现有债权
        for frame in self.claim_frames:
            frame.destroy()
        self.claim_frames.clear()
        self.claims.clear()

        if claims_data:
            for cd in claims_data:
                self.add_claim_row(claim_data=cd)
        else:
            self.add_claim_row()

    def set_payments(self, payments_data):
        """根据数据列表重建清偿记录UI

        payments_data: list of dict, 每个dict包含:
            amount, date, deduct_order
        """
        # 清空现有清偿记录
        for frame in self.payment_frames:
            frame.destroy()
        self.payment_frames.clear()
        self.payments.clear()

        if payments_data:
            for pd_item in payments_data:
                self.add_payment_row(payment_data=pd_item)

    def set_result_text(self, text):
        """设置结果预览文本"""
        self.result_text.delete("1.0", tk.END)
        self.result_text.insert(tk.END, text)

    def get_claims_data(self):
        """获取债权数据列表"""
        result = []
        for i, claim in enumerate(self.claims):
            result.append({
                "principal": claim["principal"].get(),
                "rate_type": claim["rate_type"].get(),
                "lpr_multiple": claim["lpr_multiple"].get(),
                "fixed_rate": claim["fixed_rate"].get(),
                "days_per_year": claim["days_per_year"].get(),
                "start_date": claim["start_date"].get(),
                "end_date": claim["end_date"].get(),
            })
        return result

    def get_payments_data(self):
        """获取清偿记录数据列表"""
        result = []
        for i, payment in enumerate(self.payments):
            result.append({
                "amount": payment["amount"].get(),
                "date": payment["date"].get(),
                "deduct_order": payment.get("deduct_order", []),
            })
        return result

    def fill_form(self, data):
        """用数据库数据回填表单"""
        self.case_no_var.set(data.get("case_no", ""))
        self.creditor_var.set(data.get("creditor", ""))
        self.debtor_var.set(data.get("debtor", ""))
        self.case_reason_var.set(data.get("case_reason", ""))
        self.id_card_var.set(data.get("id_card", ""))
        self.exec_basis_var.set(data.get("exec_basis", ""))
        self.other_fees_var.set(str(data.get("other_fees", "")))
        self.litigation_fee_var.set(str(data.get("litigation_fee", "")))
        self.interest_claim_var.set(str(data.get("interest_claim", "")))

        calc = data.get("calc_result")
        if calc:
            self.due_date_var.set(calc.get("due_date", datetime.now().strftime("%Y-%m-%d")))

            # 清空并重建债权
            for frame in self.claim_frames:
                frame.destroy()
            self.claim_frames.clear()
            self.claims.clear()

            claims_data = calc.get("claims", [])
            if claims_data:
                for c in claims_data:
                    self.add_claim_row(claim_data={
                        "principal": str(c.get("principal", "")),
                        "rate_type": c.get("rate_type", "一年期LPR分段"),
                        "lpr_multiple": str(c.get("lpr_multiple", "100")),
                        "fixed_rate": str(c.get("fixed_rate", "")),
                        "days_per_year": str(c.get("days_per_year", "365")),
                        "start_date": c.get("start_date", ""),
                        "end_date": c.get("end_date", ""),
                    })
                    self._update_rate_type_state(self.claims[-1])
            else:
                self.add_claim_row()

            # 清空并重建清偿记录
            for frame in self.payment_frames:
                frame.destroy()
            self.payment_frames.clear()
            self.payments.clear()

            payments_data = calc.get("payments", [])
            for p in payments_data:
                self.add_payment_row(payment_data={
                    "amount": str(p.get("amount", "")),
                    "date": p.get("date", datetime.now().strftime("%Y-%m-%d")),
                    "deduct_order": p.get("deduct_order", []),
                })

    def clear_basic_info(self):
        """清空基本信息表单"""
        self.case_no_var.set("")
        self.creditor_var.set("")
        self.debtor_var.set("")
        self.case_reason_var.set("")
        self.id_card_var.set("")
        self.exec_basis_var.set("")
        self.other_fees_var.set("")
        self.litigation_fee_var.set("")
        self.interest_claim_var.set("")
        self.due_date_var.set(datetime.now().strftime("%Y-%m-%d"))

    def clear_claims_to_default(self):
        """清空债权到默认状态（保留一个空行）"""
        while len(self.claims) > 1:
            self.remove_claim_row(0)
        if self.claims:
            self.claims[0]["principal"].set("")
            self.claims[0]["rate_type"].set("一年期LPR分段")
            self.claims[0]["lpr_multiple"].set("100")
            self.claims[0]["fixed_rate"].set("")
            self.claims[0]["days_per_year"].set("365")
            self.claims[0]["start_date"].set(datetime.now().strftime("%Y-%m-%d"))
            self.claims[0]["end_date"].set(datetime.now().strftime("%Y-%m-%d"))
            self._update_rate_type_state(self.claims[0])

    def clear_payments(self):
        """清空所有清偿记录"""
        while len(self.payments) > 0:
            self.remove_payment_row(0)

    def clear_result(self):
        """清空结果预览"""
        self.result_text.delete("1.0", tk.END)

    def reset_case_selector(self):
        """重置案件选择器"""
        self.case_selector.set("")

    def get_case_selector_value(self):
        """获取案件选择器的值"""
        return self.case_selector.get()

    def get_search_keyword(self):
        """获取检索关键词"""
        return self.search_entry.get().strip()

    def toggle_search_ui(self, show_search):
        """切换检索UI模式

        show_search: True显示检索输入框，False显示下拉框
        """
        if show_search:
            self.case_selector.pack_forget()
            self.search_entry.pack(side=tk.LEFT, padx=2, before=self.search_btn)
            self.search_entry.delete(0, tk.END)
            self.search_entry.focus_set()
            self.search_btn.config(text="确认", bg="#f0ad4e")
        else:
            self.search_entry.pack_forget()
            self.case_selector.pack(side=tk.LEFT, padx=2, before=self.search_btn)
            self.search_btn.config(text="检索", bg="#5bc0de")

    def set_case_selector_values(self, values, selected_value=""):
        """设置案件选择器的值列表和选中值"""
        self.case_selector.config(values=values, state="readonly")
        self.case_selector.set(selected_value)

    def get_result_text(self):
        """获取结果预览文本"""
        return self.result_text.get("1.0", tk.END).strip()

    # 别名，兼容Controller调用
    def add_claim(self, claim_data=None):
        return self.add_claim_row(claim_data)

    def add_payment(self, payment_data=None):
        return self.add_payment_row(payment_data)

    def remove_claim(self, idx):
        return self.remove_claim_row(idx)

    def remove_payment(self, idx):
        return self.remove_payment_row(idx)

    # ========== 基本信息 getter/setter ==========
    def get_case_no(self): return self.case_no_var.get()
    def set_case_no(self, v): self.case_no_var.set(v)
    def get_creditor(self): return self.creditor_var.get()
    def set_creditor(self, v): self.creditor_var.set(v)
    def get_debtor(self): return self.debtor_var.get()
    def set_debtor(self, v): self.debtor_var.set(v)
    def get_case_reason(self): return self.case_reason_var.get()
    def set_case_reason(self, v): self.case_reason_var.set(v)
    def get_id_card(self): return self.id_card_var.get()
    def set_id_card(self, v): self.id_card_var.set(v)
    def get_exec_basis(self): return self.exec_basis_var.get()
    def set_exec_basis(self, v): self.exec_basis_var.set(v)
    def get_other_fees(self): return self.other_fees_var.get()
    def set_other_fees(self, v): self.other_fees_var.set(v)
    def get_litigation_fee(self): return self.litigation_fee_var.get()
    def set_litigation_fee(self, v): self.litigation_fee_var.set(v)
    def get_interest_claim(self): return self.interest_claim_var.get()
    def set_interest_claim(self, v): self.interest_claim_var.set(v)
    def get_due_date(self): return self.due_date_var.get()
    def set_due_date(self, v): self.due_date_var.set(v)

    # ========== 从字典填充基本信息 ==========
    def fill_basic_data(self, basic_data):
        """从字典填充基本信息"""
        if "案号" in basic_data: self.case_no_var.set(basic_data["案号"])
        if "申请执行人" in basic_data: self.creditor_var.set(basic_data["申请执行人"])
        if "被执行人" in basic_data: self.debtor_var.set(basic_data["被执行人"])
        if "案由" in basic_data: self.case_reason_var.set(basic_data["案由"])
        if "证件号" in basic_data: self.id_card_var.set(basic_data["证件号"])
        if "执行依据" in basic_data: self.exec_basis_var.set(basic_data["执行依据"])
        if "其他费用" in basic_data: self.other_fees_var.set(basic_data["其他费用"])
        if "诉讼费用" in basic_data: self.litigation_fee_var.set(basic_data["诉讼费用"])
        if "利息主张" in basic_data: self.interest_claim_var.set(basic_data["利息主张"])
        if "履行期限届满之日" in basic_data:
            due = basic_data["履行期限届满之日"]
            if due and due != "nan": self.due_date_var.set(due)

    # ========== 清除/添加主张与还款 ==========
    def clear_claims(self):
        for frame in self.claim_frames:
            frame.destroy()
        self.claim_frames.clear()
        self.claims.clear()

    def add_claim_with_data(self, claim_data=None):
        self.add_claim_row(claim_data)
        # 更新利率类型状态（启用/禁用对应输入框）
        if self.claims:
            self._update_rate_type_state(self.claims[-1])

    def add_payment_with_data(self, payment_data=None):
        self.add_payment_row(payment_data)

    # ========== 计算结果 ==========
    def clear_calc_result(self):
        self.result_text.delete("1.0", tk.END)
        self.calc_result = None

    # ========== 保存状态 ==========
    def mark_unsaved(self):
        self.is_saved = False
        self._unsaved_changes = True

    def mark_saved(self, case_no):
        self.is_saved = True
        self._unsaved_changes = False
        self.loaded_case_no = case_no

    def has_unsaved_changes(self):
        return self._unsaved_changes

    def get_loaded_case_no(self):
        return getattr(self, 'loaded_case_no', None)

    def set_loaded_case_no(self, case_no):
        self.loaded_case_no = case_no

    # ========== 全部清除 ==========
    def clear_all_inputs(self):
        self.clear_basic_info()
        self.clear_claims_to_default()
        self.clear_payments()
        self.clear_result()

    # ========== 重置状态 ==========
    def reset_state(self):
        self.calc_result = None
        self.is_saved = False
        self.loaded_case_no = None
        self._unsaved_changes = False

    # ========== 导出基本信息字典 ==========
    def get_basic_data_dict(self):
        return {
            "案号": self.case_no_var.get(),
            "申请执行人": self.creditor_var.get(),
            "被执行人": self.debtor_var.get(),
            "案由": self.case_reason_var.get(),
            "证件号": self.id_card_var.get(),
            "执行依据": self.exec_basis_var.get(),
            "其他费用": self.other_fees_var.get(),
            "诉讼费用": self.litigation_fee_var.get(),
            "利息主张": self.interest_claim_var.get(),
            "履行期限届满之日": self.due_date_var.get(),
        }

    # ========== 案件选择器 ==========
    def set_case_selector_value(self, v):
        self.case_selector.set(v)

    # ========== 还款数据 ==========
    def get_payment_data_by_idx(self, p_idx):
        if 0 <= p_idx < len(self.payments):
            p = self.payments[p_idx]
            return {
                "amount": p["amount"].get(),
                "date": p["date"].get(),
                "deduct_order": p.get("deduct_order", []),
            }
        return None

    # ========== 主张数量 ==========
    def get_claims_count(self):
        return len(self.claims)


# ==================== 计算器视图 ====================

class CalculatorView(tk.Frame):
    def __init__(self, parent, **kwargs):
        super().__init__(parent, **kwargs)

        # 回调函数（由Controller设置）
        self.on_calculate = None
        self.on_copy_result = None
        self.on_copy_exec_fee = None
        self.on_clear = None

        self.build_ui()

    def build_ui(self):
        main_frame = tk.Frame(self)
        main_frame.pack(fill=tk.BOTH, expand=True, padx=20)

        # 输入框容器，左对齐
        entry_frame = tk.Frame(main_frame)
        entry_frame.pack(fill=tk.X, pady=(20, 10))

        self.expr_var = tk.StringVar()
        self.expr_var.trace("w", self._on_expr_change)

        entry = tk.Entry(entry_frame, textvariable=self.expr_var, font=("Arial", 18),
                        width=50, justify=tk.LEFT)
        entry.pack(fill=tk.X)
        entry.bind("<FocusIn>", track_focus)

        self.result_var = tk.StringVar(value="结果: 0")
        result_label = tk.Label(main_frame, textvariable=self.result_var,
                               font=("Arial", 20, "bold"), fg="#4a90d9")
        result_label.pack(pady=10)

        self.exec_var = tk.StringVar(value="执行费: 0")
        exec_label = tk.Label(main_frame, textvariable=self.exec_var,
                             font=("仿宋", 14), fg="#d9534f")
        exec_label.pack(pady=5)

        btn_frame = tk.Frame(main_frame)
        btn_frame.pack(pady=10)

        tk.Button(btn_frame, text="复制结果", font=("仿宋", 12),
                 command=self._on_copy_result, bg="#5bc0de").pack(side=tk.LEFT, padx=5)
        tk.Button(btn_frame, text="复制执行费", font=("仿宋", 12),
                 command=self._on_copy_exec_fee, bg="#f0ad4e").pack(side=tk.LEFT, padx=5)
        tk.Button(btn_frame, text="清空", font=("仿宋", 12),
                 command=self._on_clear, bg="#d9534f", fg="white").pack(side=tk.LEFT, padx=5)

        tip = tk.Label(main_frame, text="支持 + - × ÷ ( ) 运算，自动识别中文符号 | Enter:下一格 | 方向键:跳转",
                      font=("仿宋", 11), fg="#666")
        tip.pack(pady=10)

    def _on_expr_change(self, *args):
        if self.on_calculate:
            self.on_calculate()

    def _on_copy_result(self):
        if self.on_copy_result:
            self.on_copy_result()

    def _on_copy_exec_fee(self):
        if self.on_copy_exec_fee:
            self.on_copy_exec_fee()

    def _on_clear(self):
        if self.on_clear:
            self.on_clear()

    # ---------- 供Controller调用的方法 ----------

    def get_expression(self):
        """获取表达式"""
        return self.expr_var.get()

    def set_result(self, result_str):
        """设置结果显示"""
        self.result_var.set(f"结果: {result_str}")

    def set_exec_fee(self, fee_str):
        """设置执行费显示"""
        self.exec_var.set(f"执行费: {fee_str}")

    def get_result_text(self):
        """获取结果文本（不含前缀）"""
        return self.result_var.get().replace("结果: ", "")

    def get_exec_fee_text(self):
        """获取执行费文本（不含前缀）"""
        return self.exec_var.get().replace("执行费: ", "")

    def clear(self):
        """清空"""
        self.expr_var.set("")
        self.result_var.set("结果: 0")
        self.exec_var.set("执行费: 0")

    def set_last_result(self, value):
        """保存最近一次计算结果"""
        self._last_result = value

    def set_last_exec_fee(self, value):
        """保存最近一次执行费"""
        self._last_exec_fee = value


# ==================== 主视图 ====================

class MainView:
    def __init__(self):
        self.root = tk.Tk()
        self.root.title("熊爵执行小助手 v2")
        self.root.geometry(f"{WINDOW_WIDTH}x{WINDOW_HEIGHT}")
        self.root.resizable(False, False)

        screen_width = self.root.winfo_screenwidth()
        screen_height = self.root.winfo_screenheight()
        x = (screen_width - WINDOW_WIDTH) // 2
        y = (screen_height - WINDOW_HEIGHT) // 2
        self.root.geometry(f"{WINDOW_WIDTH}x{WINDOW_HEIGHT}+{x}+{y}")

        self.build_ui()

        # 绑定全局键盘事件
        self.bind_global_keyboard_events()

    def build_ui(self):
        main_frame = tk.Frame(self.root)
        main_frame.pack(fill=tk.BOTH, expand=True)

        self.clipboard_panel = ClipboardPanel(main_frame)
        self.clipboard_panel.pack(side=tk.LEFT, fill=tk.Y)

        right_frame = tk.Frame(main_frame)
        right_frame.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)

        self.notebook = ttk.Notebook(right_frame)
        self.notebook.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)

        self.distribution_view = DistributionView(self.notebook)
        self.notebook.add(self.distribution_view, text="  分配方案  ")

        self.interest_view = InterestView(self.notebook)
        self.notebook.add(self.interest_view, text="  利息计算  ")

        self.calculator_view = CalculatorView(self.notebook)
        self.notebook.add(self.calculator_view, text="  计算器  ")

        self.status = tk.Label(self.root, text="熊爵执行小助手 v2 | 案件数据自动保存到 cases_db.json | Enter:下一格 | 方向键:跳转",
                         font=("仿宋", 10), bd=1, relief=tk.SUNKEN, anchor=tk.W)
        self.status.pack(side=tk.BOTTOM, fill=tk.X)

    def bind_global_keyboard_events(self):
        """绑定全局键盘事件，实现Enter和方向键跳转"""
        from .utils import handle_enter_key, handle_arrow_key
        self.root.bind_all("<Return>", handle_enter_key)
        self.root.bind_all("<KP_Enter>", handle_enter_key)
        self.root.bind_all("<Up>", handle_arrow_key)
        self.root.bind_all("<Down>", handle_arrow_key)
        self.root.bind_all("<Left>", handle_arrow_key)
        self.root.bind_all("<Right>", handle_arrow_key)
        # 全局焦点追踪：捕获所有控件的焦点变化
        self.root.bind_all("<FocusIn>", track_focus)

    def get_distribution_view(self):
        return self.distribution_view

    def get_interest_view(self):
        return self.interest_view

    def get_calculator_view(self):
        return self.calculator_view

    def run(self):
        self.root.mainloop()
