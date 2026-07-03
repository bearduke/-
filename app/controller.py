"""
Controller层 - MVC架构的控制器
连接Model和View，处理所有用户交互逻辑
"""

import tkinter as tk
from tkinter import ttk, messagebox, filedialog
from datetime import datetime
from .model import DistributionModel, InterestModel, CalculatorModel
from .utils import (
    format_money, parse_money, get_all_case_nos, get_case, save_case,
    CASES_DB, load_cases_db, save_cases_db, calc_execution_fee,
    track_focus, to_chinese_date, set_cell_font, set_run_font,
    get_lpr_segments, days_between, LPR_DATA
)
import re
import os
import json


class AppController:
    """主控制器，连接View和Model"""

    def __init__(self, view):
        self.view = view
        self.dist_model = DistributionModel()
        self.interest_model = InterestModel()
        self.calc_model = CalculatorModel()
        self._bind_callbacks()
        self._refresh_case_selectors()

    # ==================== 回调绑定 ====================

    def _bind_callbacks(self):
        """将View的回调连接到Controller的方法"""
        # 分配模块回调
        dv = self.view.distribution_view
        dv.on_add_case = self.add_dist_case
        dv.on_save_edit = self.save_dist_edit
        dv.on_delete_case = self.delete_dist_case
        dv.on_clear_form = self.clear_dist_form
        dv.on_clear_case_list = self.clear_dist_list
        dv.on_set_total_amount = self.set_dist_total_amount
        dv.on_import_excel = self.import_dist_excel
        dv.on_import_from_db = self.import_dist_from_db
        dv.on_export_excel = self.export_dist_excel
        dv.on_generate_doc = self.generate_dist_doc
        dv.on_case_selected = self.dist_case_selected
        dv.on_tree_select = self.dist_on_select

        # 利息模块回调
        iv = self.view.interest_view
        iv.on_calculate = self.calculate_interest
        iv.on_save_to_db = self.save_interest_to_db
        iv.on_export_excel = self.export_interest_excel
        iv.on_import_excel = self.import_interest_excel
        iv.on_copy_preview = self.copy_interest_preview
        iv.on_manage_lpr = self.manage_lpr
        iv.on_clear = self.clear_interest
        iv.on_case_selected = self.interest_case_selected
        iv.on_add_claim = self.add_claim
        iv.on_add_payment = self.add_payment
        iv.on_remove_claim = self.remove_claim
        iv.on_remove_payment = self.remove_payment
        iv.on_set_payment_deduct_order = self.set_payment_deduct_order
        iv.on_delete_from_db = self.delete_interest_from_db
        iv.on_toggle_search = self.toggle_interest_search
        iv.on_search = self.search_interest_case
        iv.on_data_changed = self.interest_data_changed

        # 计算器模块回调
        cv = self.view.calculator_view
        cv.on_calculate = self.calculate_expr
        cv.on_calc_exec_fee = self.calc_exec_fee
        cv.on_copy_result = self.copy_calc_result
        cv.on_copy_exec_fee = self.copy_exec_fee
        cv.on_clear = self.clear_expr

    # ==================== 分配方案模块 ====================

    def add_dist_case(self):
        """添加案件到分配列表"""
        case = self._get_dist_form_data()
        if not case:
            return
        self.dist_model.add_case(case)
        self._refresh_dist_tree()
        self.clear_dist_form()
        self._calculate_and_refresh_dist()
        messagebox.showinfo("成功", "案件添加成功！")

    def save_dist_edit(self):
        """保存编辑的案件"""
        idx = self.view.distribution_view.get_selected_idx()
        if idx is None:
            messagebox.showwarning("提示", "请先选择要编辑的案件")
            return
        case = self._get_dist_form_data()
        if not case:
            return
        self.dist_model.update_case(idx, case)
        self._refresh_dist_tree()
        self.view.distribution_view.set_selected_idx(None)
        self.clear_dist_form()
        self._calculate_and_refresh_dist()
        messagebox.showinfo("成功", "修改保存成功！")

    def delete_dist_case(self):
        """删除选中的案件"""
        idx = self.view.distribution_view.get_selected_idx()
        if idx is None:
            messagebox.showwarning("提示", "请先选择要删除的案件")
            return
        if messagebox.askyesno("确认", "确定删除该案件吗？"):
            self.dist_model.delete_case(idx)
            self._refresh_dist_tree()
            self.view.distribution_view.set_selected_idx(None)
            self.clear_dist_form()
            self._calculate_and_refresh_dist()

    def clear_dist_form(self):
        """清空分配表单"""
        self.view.distribution_view.clear_form()

    def clear_dist_list(self):
        """清空分配列表"""
        if not self.dist_model.cases:
            return
        if messagebox.askyesno("确认", "确定清空当前分配列表吗？\n（案件库数据不受影响）"):
            self.dist_model.clear_cases()
            self.view.distribution_view.set_selected_idx(None)
            self.view.distribution_view.set_total_amount_text("")
            self.view.distribution_view.set_total_label("当前: 0.00元")
            self._refresh_dist_tree()
            self.view.distribution_view.set_result_text("请设置分配总金额并添加案件")

    def set_dist_total_amount(self):
        """设置分配总金额"""
        try:
            amount = parse_money(self.view.distribution_view.get_total_amount_text())
            if amount <= 0:
                messagebox.showwarning("提示", "请输入有效的金额")
                return
            self.dist_model.set_total_amount(amount)
            self.view.distribution_view.set_total_label(f"当前: {format_money(amount)}元")
            self._calculate_and_refresh_dist()
        except Exception as e:
            messagebox.showerror("错误", f"金额格式错误: {e}")

    def import_dist_excel(self):
        """从Excel导入案件数据（使用openpyxl）"""
        file_path = filedialog.askopenfilename(
            title="选择Excel文件",
            filetypes=[("Excel文件", "*.xlsx *.xls"), ("所有文件", "*.*")]
        )
        if not file_path:
            return
        try:
            from openpyxl import load_workbook
            wb = load_workbook(file_path)
            ws = wb.active
            headers = [cell.value for cell in ws[1]]

            required_cols = ["案号", "债权人", "债务人", "证件号", "执行依据", "案由",
                             "本金", "利息", "诉讼费", "债权类型"]
            col_map = {}
            for req in required_cols:
                for col_idx, col in enumerate(headers):
                    if col and req in str(col):
                        col_map[req] = col_idx
                        break

            if len(col_map) < 7:
                messagebox.showerror("错误", "Excel列名不匹配")
                return

            count = 0
            for row in ws.iter_rows(min_row=2, values_only=True):
                # 使用col_map将原始列名映射为标准列名
                row_dict = {}
                for req, col_idx in col_map.items():
                    row_dict[req] = row[col_idx] if col_idx < len(row) else ""
                case = self.dist_model.import_excel_row(row_dict)
                if case["case_no"] and case["creditor"]:
                    self.dist_model.add_case(case)
                    count += 1

            self._refresh_dist_tree()
            self._calculate_and_refresh_dist()
            messagebox.showinfo("成功", f"成功导入 {count} 条案件数据")
        except Exception as e:
            messagebox.showerror("错误", f"导入失败: {e}")

    def import_dist_from_db(self):
        """从案件库批量导入到当前分配列表"""
        if not CASES_DB:
            messagebox.showwarning("提示", "案件库为空")
            return

        dialog = tk.Toplevel(self.view.root)
        dialog.title("从案件库导入")
        dialog.geometry("500x450")
        dialog.transient(self.view.root)
        dialog.grab_set()

        tk.Label(dialog, text="选择要导入的案件（可多选Ctrl+Click）:", font=("仿宋", 11)).pack(pady=5)

        frame = tk.Frame(dialog)
        frame.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)

        columns = ("案号", "债权人", "债务人", "本金", "利息", "诉讼费")
        tree = ttk.Treeview(frame, columns=columns, show="headings", height=12, selectmode="extended")

        col_widths = [150, 100, 100, 80, 80, 80]
        for col, width in zip(columns, col_widths):
            tree.heading(col, text=col)
            tree.column(col, width=width, anchor="center")

        vsb = tk.ttk.Scrollbar(frame, orient=tk.VERTICAL, command=tree.yview)
        hsb = tk.ttk.Scrollbar(frame, orient=tk.HORIZONTAL, command=tree.xview)
        tree.configure(yscrollcommand=vsb.set, xscrollcommand=hsb.set)

        tree.grid(row=0, column=0, sticky="nsew")
        vsb.grid(row=0, column=1, sticky="ns")
        hsb.grid(row=1, column=0, sticky="ew")

        frame.grid_rowconfigure(0, weight=1)
        frame.grid_columnconfigure(0, weight=1)

        case_list = []
        for case_no in get_all_case_nos():
            case_data = CASES_DB[case_no].copy()
            case_list.append(case_data)

            principal = 0
            interest = 0
            litigation_fee = 0

            calc_result = case_data.get("calc_result", {})
            if calc_result:
                principal = round(calc_result.get("total_remaining_principal", 0) +
                                  calc_result.get("remaining_other", 0), 2)
                interest = round(calc_result.get("total_remaining_interest", 0), 2)
                litigation_fee = round(calc_result.get("remaining_litigation", 0), 2)
            else:
                principal = round(case_data.get("principal", 0), 2)
                interest = round(case_data.get("interest", 0), 2)
                litigation_fee = round(case_data.get("litigation_fee", 0), 2)

            tree.insert("", tk.END, values=(
                case_no,
                case_data.get("creditor", "")[:8],
                case_data.get("debtor", "")[:8],
                format_money(principal),
                format_money(interest),
                format_money(litigation_fee)
            ))

        select_frame = tk.Frame(dialog)
        select_frame.pack(fill=tk.X, padx=5, pady=2)

        def select_all():
            for item in tree.get_children():
                tree.selection_add(item)

        def deselect_all():
            tree.selection_remove(*tree.selection())

        tk.Button(select_frame, text="全选", font=("仿宋", 10), command=select_all, width=8).pack(side=tk.LEFT, padx=2)
        tk.Button(select_frame, text="取消全选", font=("仿宋", 10), command=deselect_all, width=10).pack(side=tk.LEFT, padx=2)

        controller = self

        def do_import():
            selected = tree.selection()
            if not selected:
                messagebox.showwarning("提示", "请至少选择一个案件")
                return

            count = 0
            for item in selected:
                idx = tree.index(item)
                if idx < len(case_list):
                    case_data = case_list[idx].copy()

                    calc_result = case_data.get("calc_result", {})
                    if calc_result:
                        principal = round(calc_result.get("total_remaining_principal", 0) +
                                          calc_result.get("remaining_other", 0), 2)
                        interest = round(calc_result.get("total_remaining_interest", 0), 2)
                        litigation_fee = round(calc_result.get("remaining_litigation", 0), 2)
                    else:
                        principal = round(case_data.get("principal", 0), 2)
                        interest = round(case_data.get("interest", 0), 2)
                        litigation_fee = round(case_data.get("litigation_fee", 0), 2)

                    import_case = {
                        "case_no": case_data.get("case_no", ""),
                        "creditor": case_data.get("creditor", ""),
                        "debtor": case_data.get("debtor", ""),
                        "id_card": case_data.get("id_card", ""),
                        "exec_basis": case_data.get("exec_basis", ""),
                        "case_reason": case_data.get("case_reason", ""),
                        "principal": principal,
                        "interest": interest,
                        "litigation_fee": litigation_fee,
                        "claim_type": case_data.get("claim_type", "第一顺位"),
                    }

                    exists = any(c.get("case_no") == import_case["case_no"] for c in controller.dist_model.cases)
                    if exists:
                        if not messagebox.askyesno("重复案号", f"案号 {import_case['case_no']} 已在列表中，是否继续添加？"):
                            continue

                    controller.dist_model.add_case(import_case)
                    count += 1

            if count > 0:
                controller._refresh_dist_tree()
                controller._calculate_and_refresh_dist()
                dialog.destroy()
                messagebox.showinfo("成功", f"成功导入 {count} 个案件")
            else:
                messagebox.showinfo("提示", "没有导入任何案件")

        btn_frame = tk.Frame(dialog)
        btn_frame.pack(pady=5)

        tk.Button(btn_frame, text="导入选中", font=("仿宋", 11), command=do_import,
                  bg="#5cb85c", fg="white", width=12).pack(side=tk.LEFT, padx=5)
        tk.Button(btn_frame, text="取消", font=("仿宋", 11), command=dialog.destroy,
                  bg="#d9534f", fg="white", width=8).pack(side=tk.LEFT, padx=5)

        tk.Label(dialog, text=f"共 {len(case_list)} 个案件", font=("仿宋", 10), fg="#666").pack(pady=2)

    def export_dist_excel(self):
        """导出当前案件数据及分配结果到Excel（双表，使用openpyxl）"""
        if not self.dist_model.cases:
            messagebox.showwarning("提示", "当前案件列表为空，无法导出")
            return

        default_filename = "分配方案.xlsx"
        if self.dist_model.cases:
            case_no = self.dist_model.cases[0].get("case_no", "").strip()
            if case_no:
                invalid_chars = r'[<>:"/\\|?*]'
                case_no_clean = re.sub(invalid_chars, '_', case_no)
                default_filename = f"{case_no_clean}分配方案.xlsx"

        file_path = filedialog.asksaveasfilename(
            title="导出Excel",
            initialfile=default_filename,
            defaultextension=".xlsx",
            filetypes=[("Excel文件", "*.xlsx"), ("所有文件", "*.*")]
        )
        if not file_path:
            return

        try:
            from openpyxl import Workbook
            wb = Workbook()

            # Sheet 1: 案件数据
            ws1 = wb.active
            ws1.title = "案件数据"
            import_headers = ["案号", "债权人", "债务人", "证件号", "执行依据", "案由", "本金", "利息", "诉讼费", "债权类型"]
            ws1.append(import_headers)
            import_data, result_data = self.dist_model.export_to_excel_data()
            for row_dict in import_data:
                ws1.append([row_dict.get(h, "") for h in import_headers])

            # Sheet 2: 分配结果
            if not result_data:
                messagebox.showwarning("提示", "尚未计算分配结果，请先设置分配金额并确保案件已添加")
                return

            ws2 = wb.create_sheet("分配结果")
            result_headers = ["案号", "申请执行人", "申请执行标的金额", "诉讼费", "本案分配金额", "执行费", "实际发放金额"]
            ws2.append(result_headers)
            for row_dict in result_data:
                ws2.append([row_dict.get(h, "") for h in result_headers])

            wb.save(file_path)
            messagebox.showinfo("成功", f"数据已导出至:\n{file_path}")
        except Exception as e:
            messagebox.showerror("错误", f"导出失败: {e}")

    def generate_dist_doc(self):
        """生成分配方案Word文档"""
        if not self.dist_model.distribution_results:
            if self.dist_model.total_amount > 0 and self.dist_model.cases:
                self._calculate_and_refresh_dist()
            else:
                messagebox.showwarning("提示", "请先设置分配总金额并添加案件")
                return

        if not self.dist_model.distribution_results:
            messagebox.showwarning("提示", "分配计算结果为空，请检查案件数据和分配金额")
            return

        default_filename = "分配方案.docx"
        if self.dist_model.cases:
            case_no = self.dist_model.cases[0].get("case_no", "").strip()
            if case_no:
                invalid_chars = r'[<>:"/\\|?*]'
                case_no_clean = re.sub(invalid_chars, '_', case_no)
                default_filename = f"{case_no_clean}分配方案.docx"

        file_path = filedialog.asksaveasfilename(
            title="保存分配方案",
            defaultextension=".docx",
            initialfile=default_filename,
            filetypes=[("Word文档", "*.docx")]
        )
        if not file_path:
            return

        try:
            from docx import Document
            from docx.shared import Pt, Inches, Cm, RGBColor
            from docx.enum.text import WD_ALIGN_PARAGRAPH
            from docx.oxml import OxmlElement
            from docx.oxml.ns import qn

            doc = Document()

            style = doc.styles['Normal']
            style.font.name = '仿宋'
            style.font.size = Pt(16)
            style._element.rPr.rFonts.set(qn('w:eastAsia'), '仿宋')
            style.paragraph_format.line_spacing = Pt(26)
            style.paragraph_format.space_after = Pt(0)

            title = doc.add_paragraph()
            title.alignment = WD_ALIGN_PARAGRAPH.CENTER
            run = title.add_run("广东省广州市南沙区人民法院\n执行财产分配方案")
            set_run_font(run, "宋体", 22, True)
            title.paragraph_format.space_after = Pt(12)

            if self.dist_model.cases:
                p = doc.add_paragraph()
                p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
                run = p.add_run(self.dist_model.cases[0]['case_no'])
                set_run_font(run, "仿宋", 16)

            p = doc.add_paragraph()
            p.alignment = WD_ALIGN_PARAGRAPH.LEFT
            run = p.add_run("一、案件的由来及执行情况")
            set_run_font(run, "仿宋", 16, True)
            p.paragraph_format.first_line_indent = Pt(32)
            p.paragraph_format.line_spacing = Pt(26)

            if self.dist_model.cases:
                first_case = self.dist_model.cases[0]
                p = doc.add_paragraph()
                p.alignment = WD_ALIGN_PARAGRAPH.LEFT
                run = p.add_run(
                    f"本院在执行申请执行人{first_case['creditor']}与被执行人{first_case['debtor']}"
                    f"{first_case['case_reason']}案件中，因被执行人{first_case['debtor']}可供执行的财产"
                    f"不足以清偿全部债务，需对被执行人{first_case['debtor']}的执行财产进行分配。"
                    f"据此，本院依法组成合议庭，对财产分配进行审查，现已审查完毕。"
                )
                set_run_font(run, "仿宋", 16)
                p.paragraph_format.first_line_indent = Pt(32)
                p.paragraph_format.line_spacing = Pt(26)

            p = doc.add_paragraph()
            p.alignment = WD_ALIGN_PARAGRAPH.LEFT
            run = p.add_run("二、各债权人执行情况")
            set_run_font(run, "仿宋", 16, True)
            p.paragraph_format.first_line_indent = Pt(32)
            p.paragraph_format.line_spacing = Pt(26)

            for idx, data in enumerate(self.dist_model.distribution_results, 1):
                c = data["case"]
                paragraph_text = (
                    f"{idx}.债权人{c['creditor']}："
                    f"执行案号为{c['case_no']}，"
                    f"执行依据为{c['exec_basis']}，"
                    f"申请执行的标的金额为{format_money(c['principal'] + c['interest'] + c['litigation_fee'])}元，"
                    f"其中债权本金{format_money(c['principal'])}元，"
                    f"利息{format_money(c['interest'])}元，"
                    f"诉讼费用{format_money(c['litigation_fee'])}元。"
                )
                p = doc.add_paragraph(paragraph_text)
                p.paragraph_format.first_line_indent = Pt(32)
                p.paragraph_format.line_spacing = Pt(26)
                for run in p.runs:
                    run.font.size = Pt(16)
                    run.font.name = '仿宋'
                    run._element.rPr.rFonts.set(qn('w:eastAsia'), '仿宋')

            p = doc.add_paragraph()
            p.alignment = WD_ALIGN_PARAGRAPH.LEFT
            run = p.add_run("三、债权分配")
            set_run_font(run, "仿宋", 16, True)
            p.paragraph_format.first_line_indent = Pt(32)
            p.paragraph_format.line_spacing = Pt(26)

            if self.dist_model.cases:
                first_case = self.dist_model.cases[0]
                _now = datetime.now()
                p = doc.add_paragraph()
                p.alignment = WD_ALIGN_PARAGRAPH.LEFT
                run = p.add_run(
                    f"在执行过程中，截至{_now.year}年{_now.month:02d}月{_now.day:02d}日，"
                    f"本院共执行到位被执行人{first_case['debtor']}名下执行财产"
                    f"{format_money(self.dist_model.total_amount)}元，"
                    f"本次可分配款项共{format_money(self.dist_model.total_amount)}元，将作如下顺序分配："
                )
                set_run_font(run, "仿宋", 16)
                p.paragraph_format.first_line_indent = Pt(32)
                p.paragraph_format.line_spacing = Pt(26)

            rules = [
                "1.执行费用（如财产处置中产生的评估费、保管费、拍卖佣金等）/诉讼费用（如案件受理费、保全费等）；",
                "2.优先债权（如职工工资、有担保债权、税款等）；",
                "3.普通债权；",
                "4.处于同一顺位的债权按照各债权占该顺位总债权的比例进行分配，案件执行费从各债权人本案分配金额中计除（到手金额为实际发放金额）。",
            ]
            for rule in rules:
                p = doc.add_paragraph()
                p.alignment = WD_ALIGN_PARAGRAPH.LEFT
                run = p.add_run(rule)
                set_run_font(run, "仿宋", 16)
                p.paragraph_format.first_line_indent = Pt(32)
                p.paragraph_format.line_spacing = Pt(26)

            p = doc.add_paragraph()
            p.alignment = WD_ALIGN_PARAGRAPH.LEFT
            run = p.add_run(
                "综上所述，根据《最高人民法院关于适用<中华人民共和国民事诉讼法>的解释》"
                "第五百零六条、第五百零八条的规定，制定财产分配方案如下：（单位：元）"
            )
            set_run_font(run, "仿宋", 16)
            p.paragraph_format.first_line_indent = Pt(32)
            p.paragraph_format.line_spacing = Pt(26)

            table = doc.add_table(rows=1, cols=7)
            table.style = 'Table Grid'
            doc_headers = ["案号", "申请执行人", "申请执行标的金额", "诉讼费", "本案分配金额", "执行费", "实际发放金额"]
            for i, header in enumerate(doc_headers):
                cell = table.rows[0].cells[i]
                cell.text = header
                set_cell_font(cell, "仿宋", 16, True)
                cell.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER

            total_claim = 0
            total_cost = 0
            total_allocation = 0
            total_execution_fee = 0
            total_actual = 0

            for r in self.dist_model.distribution_results:
                c = r["case"]
                row = table.add_row()
                claim_amount = c["principal"] + c["interest"] + c["litigation_fee"]
                values = [
                    c["case_no"],
                    c["creditor"],
                    format_money(claim_amount),
                    format_money(c["litigation_fee"]),
                    format_money(r["distributed"]),
                    format_money(r["exec_fee"]),
                    format_money(r["actual"])
                ]
                for i, val in enumerate(values):
                    cell = row.cells[i]
                    cell.text = str(val)
                    set_cell_font(cell, "仿宋", 16)
                    cell.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER

                total_claim += claim_amount
                total_cost += c["litigation_fee"]
                total_allocation += r["distributed"]
                total_execution_fee += r["exec_fee"]
                total_actual += r["actual"]

            row = table.add_row()
            row.cells[0].text = "总计"
            row.cells[2].text = format_money(total_claim)
            row.cells[3].text = format_money(total_cost)
            row.cells[4].text = format_money(total_allocation)
            row.cells[5].text = format_money(total_execution_fee)
            row.cells[6].text = format_money(total_actual)
            for cell in row.cells:
                set_cell_font(cell, "仿宋", 16, True)
                cell.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER

            for row in table.rows:
                for cell in row.cells:
                    paragraphs = cell.paragraphs
                    for paragraph in paragraphs:
                        paragraph.paragraph_format.line_spacing = Pt(14)
                        for run in paragraph.runs:
                            run.font.size = Pt(12)

            p = doc.add_paragraph()
            p.alignment = WD_ALIGN_PARAGRAPH.LEFT
            run = p.add_run(
                "债权人或者被执行人对分配方案有异议的，应当自收到分配方案之日起十五日内向本院提出书面异议，"
                "并同时对分配方案提出修正意见。债权人或者被执行人对分配方案提出异议的，"
                "执行法院应当通知未提出异议的债权人、被执行人。"
            )
            set_run_font(run, "仿宋", 16)
            p.paragraph_format.first_line_indent = Pt(32)
            p.paragraph_format.line_spacing = Pt(26)

            p = doc.add_paragraph()
            p.alignment = WD_ALIGN_PARAGRAPH.LEFT
            run = p.add_run(
                "未提出异议的债权人、被执行人自收到通知之日起十五日内未提出反对意见的，"
                "执行法院依异议人的意见对分配方案审查修正后进行分配；提出反对意见的，应当通知异议人。"
                "异议人可以自收到通知之日起十五日内，以提出反对意见的债权人、被执行人为被告，向执行法院提起诉讼；"
                "异议人逾期未提起诉讼的，执行法院按照原分配方案进行分配。"
            )
            set_run_font(run, "仿宋", 16)
            p.paragraph_format.first_line_indent = Pt(32)
            p.paragraph_format.line_spacing = Pt(26)

            p = doc.add_paragraph()
            p.alignment = WD_ALIGN_PARAGRAPH.LEFT
            run = p.add_run("特此告知")
            set_run_font(run, "仿宋", 16)
            p.paragraph_format.first_line_indent = Pt(32)
            p.paragraph_format.line_spacing = Pt(26)
            doc.add_paragraph("\n\n\n")

            # 添加页码
            for section in doc.sections:
                footer = section.footer
                footer.is_linked_to_previous = False
                paragraph = footer.paragraphs[0] if footer.paragraphs else footer.add_paragraph()
                paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER

                run1 = paragraph.add_run("- ")
                run1.font.size = Pt(12)
                run1.font.name = '仿宋'
                run1._element.rPr.rFonts.set(qn('w:eastAsia'), '仿宋')

                run2 = paragraph.add_run()
                fldChar1 = OxmlElement('w:fldChar')
                fldChar1.set(qn('w:fldCharType'), 'begin')
                instrText = OxmlElement('w:instrText')
                instrText.set(qn('xml:space'), 'preserve')
                instrText.text = "PAGE"
                fldChar2 = OxmlElement('w:fldChar')
                fldChar2.set(qn('w:fldCharType'), 'end')
                run2._r.append(fldChar1)
                run2._r.append(instrText)
                run2._r.append(fldChar2)
                run2.font.size = Pt(12)

                run3 = paragraph.add_run(" -")
                run3.font.size = Pt(12)
                run3.font.name = '仿宋'
                run3._element.rPr.rFonts.set(qn('w:eastAsia'), '仿宋')

            # 添加白色标记 zdqz
            marker_para = doc.add_paragraph()
            marker_para.alignment = WD_ALIGN_PARAGRAPH.RIGHT
            marker_para.paragraph_format.right_indent = Pt(65)
            marker_run = marker_para.add_run("zdqz")
            marker_run.font.size = Pt(8)
            marker_run.font.color.rgb = RGBColor(255, 255, 255)
            marker_para.paragraph_format.space_after = Pt(0)

            p = doc.add_paragraph()
            p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
            date_str = to_chinese_date(datetime.now())
            run = p.add_run(date_str)
            set_run_font(run, "仿宋", 16)

            doc.save(file_path)
            messagebox.showinfo("成功", f"分配方案已保存至:\n{file_path}")
        except Exception as e:
            messagebox.showerror("错误", f"生成文档失败: {e}")

    def dist_case_selected(self, event=None):
        """案件库下拉框选择案件"""
        case_no = self.view.distribution_view.get_case_selector_value()
        if case_no and case_no in CASES_DB:
            self._fill_dist_form(CASES_DB[case_no])

    def dist_on_select(self, event=None):
        """分配列表选中案件"""
        idx = self.view.distribution_view.get_selected_idx()
        if idx is None or idx < 0 or idx >= len(self.dist_model.cases):
            return
        self._fill_dist_form(self.dist_model.cases[idx])

    # ==================== 利息计算模块 ====================

    def calculate_interest(self):
        """计算利息"""
        try:
            iv = self.view.interest_view
            case_no = iv.get_case_no()
            creditor = iv.get_creditor()
            debtor = iv.get_debtor()
            case_reason = iv.get_case_reason()
            id_card = iv.get_id_card()
            exec_basis = iv.get_exec_basis()
            other_fees = parse_money(iv.get_other_fees())
            litigation_fee = parse_money(iv.get_litigation_fee())
            interest_claim = parse_money(iv.get_interest_claim())
            due_date = iv.get_due_date()

            claims_data = iv.get_claims_data()
            payments_data = iv.get_payments_data()

            # 验证
            for i, claim_data in enumerate(claims_data):
                principal = parse_money(claim_data.get("principal", 0))
                if principal <= 0:
                    messagebox.showwarning("提示", f"第{i+1}个债权的本金必须大于0")
                    return

            params = {
                "case_no": case_no,
                "creditor": creditor,
                "debtor": debtor,
                "case_reason": case_reason,
                "id_card": id_card,
                "exec_basis": exec_basis,
                "other_fees": other_fees,
                "litigation_fee": litigation_fee,
                "interest_claim": interest_claim,
                "due_date": due_date,
                "claims": claims_data,
                "payments": payments_data,
            }

            calc = self.interest_model.calculate_interest(params)
            if calc is None:
                messagebox.showwarning("提示", "计算失败，请检查输入数据")
                return

            self._display_interest_result(calc)
            iv.mark_unsaved()
        except Exception as e:
            messagebox.showerror("错误", f"计算失败: {e}")
            import traceback
            traceback.print_exc()

    def save_interest_to_db(self):
        """保存利息计算结果到案件库"""
        if self.interest_model.calc_result is None:
            messagebox.showwarning("提示", "未计算利息，无法保存。请先点击【计算利息】后再保存。")
            return

        iv = self.view.interest_view
        case_no = iv.get_case_no().strip()
        if not case_no:
            messagebox.showwarning("提示", "案号为空，无法保存")
            return

        is_update = case_no in CASES_DB

        data = self._get_interest_case_data()
        if not data:
            return

        total_general = sum(c.get("general_interest", 0) for c in self.interest_model.calc_result.get("claims", []))

        def make_serializable(obj):
            if isinstance(obj, tk.StringVar):
                return obj.get()
            elif isinstance(obj, dict):
                result = {}
                for k, v in obj.items():
                    if not k.startswith('_'):
                        result[k] = make_serializable(v)
                return result
            elif isinstance(obj, list):
                return [make_serializable(item) for item in obj]
            elif isinstance(obj, (str, int, float, bool, type(None))):
                return obj
            else:
                return str(obj)

        cleaned_result = make_serializable(self.interest_model.calc_result)

        if is_update:
            existing = CASES_DB[case_no].copy()
            existing.update(data)
            data = existing

        data["calc_result"] = cleaned_result
        data["interest"] = total_general

        save_case(data)
        self._refresh_case_selectors()
        iv.mark_saved(case_no)

        if is_update:
            messagebox.showinfo("成功", f"案件 {case_no} 已更新保存到案件库")
        else:
            messagebox.showinfo("成功", f"案件 {case_no} 已保存到案件库")

    def export_interest_excel(self):
        """导出利息计算数据到Excel（3个sheet，使用openpyxl）"""
        iv = self.view.interest_view
        case_no = iv.get_case_no().strip()
        if not case_no:
            messagebox.showwarning("提示", "案号为空，请输入案号后再导出")
            return

        file_path = filedialog.asksaveasfilename(
            title="导出Excel",
            initialfile=f"{case_no}利息.xlsx",
            defaultextension=".xlsx",
            filetypes=[("Excel文件", "*.xlsx"), ("所有文件", "*.*")]
        )
        if not file_path:
            return

        try:
            from openpyxl import Workbook
            wb = Workbook()

            # Sheet 1: 基本信息（多列表格格式，与v22.py一致）
            ws1 = wb.active
            ws1.title = "基本信息"
            basic_data = iv.get_basic_data_dict()
            # 第一行是列名，第二行是数据（与v22.py的DataFrame格式一致）
            ws1.append(list(basic_data.keys()))
            ws1.append(list(basic_data.values()))

            # Sheet 2: 债权明细
            ws2 = wb.create_sheet("债权明细")
            claim_headers = ["债权序号", "本金", "利率类型", "LPR倍率(%)", "固定利率(%)", "一年天数", "起算之日", "结算之日"]
            ws2.append(claim_headers)
            claims_data = iv.get_claims_data()
            for i, claim in enumerate(claims_data):
                ws2.append([
                    i + 1,
                    claim.get("principal", ""),
                    claim.get("rate_type", ""),
                    claim.get("lpr_multiple", ""),
                    claim.get("fixed_rate", ""),
                    claim.get("days_per_year", ""),
                    claim.get("start_date", ""),
                    claim.get("end_date", ""),
                ])

            # Sheet 3: 清偿记录
            ws3 = wb.create_sheet("清偿记录")
            pay_headers = ["清偿序号", "清偿金额", "清偿时间", "抵扣顺序"]
            ws3.append(pay_headers)
            payments_data = iv.get_payments_data()
            for i, payment in enumerate(payments_data):
                deduct_str = ",".join(payment.get("deduct_order", []))
                ws3.append([
                    i + 1,
                    payment.get("amount", ""),
                    payment.get("date", ""),
                    deduct_str,
                ])

            wb.save(file_path)
            messagebox.showinfo("成功", f"数据已导出至:\n{file_path}")
        except Exception as e:
            messagebox.showerror("错误", f"导出失败: {e}")

    def import_interest_excel(self):
        """从Excel导入利息计算数据（3个sheet，使用openpyxl）"""
        file_path = filedialog.askopenfilename(
            title="导入Excel",
            filetypes=[("Excel文件", "*.xlsx"), ("所有文件", "*.*")]
        )
        if not file_path:
            return

        try:
            from openpyxl import load_workbook
            wb = load_workbook(file_path)

            iv = self.view.interest_view

            # 读取基本信息
            if "基本信息" in wb.sheetnames:
                ws1 = wb["基本信息"]
                basic_data = {}
                rows = list(ws1.iter_rows(min_row=1, values_only=True))
                if rows:
                    first_row = rows[0]
                    non_none_count = sum(1 for v in first_row if v is not None)
                    if non_none_count > 2:
                        # 多列表格格式（原始v22.py导出格式）
                        # 第一行是列名，第二行是数据
                        headers = [str(v).strip() if v else "" for v in first_row]
                        for row in rows[1:]:
                            for i, h in enumerate(headers):
                                if h and i < len(row) and row[i] is not None:
                                    val_str = str(row[i])
                                    if val_str != "None" and val_str != "nan":
                                        basic_data[h] = val_str
                    else:
                        # 键值对格式（MVC版本导出格式）
                        for row in rows:
                            if row[0]:
                                val = row[1] if len(row) > 1 and row[1] is not None else ""
                                val_str = str(val)
                                if val_str == "None" or val_str == "nan":
                                    val_str = ""
                                basic_data[str(row[0])] = val_str
                iv.fill_basic_data(basic_data)

            # 清空债权和清偿记录
            iv.clear_claims()
            iv.clear_payments()

            # 读取债权明细
            if "债权明细" in wb.sheetnames:
                ws2 = wb["债权明细"]
                headers = [str(cell.value).strip() if cell.value else "" for cell in ws2[1]]
                # 建立列名映射（模糊匹配）
                claim_col_map = {
                    "本金": None, "利率类型": None, "LPR倍率(%)": None,
                    "固定利率(%)": None, "一年天数": None, "起算之日": None, "结算之日": None
                }
                claim_required = ["本金", "利率类型", "LPR倍率", "固定利率", "一年天数", "起算", "结算"]
                for req in claim_required:
                    for col_idx, h in enumerate(headers):
                        if h and req in h:
                            # 找到对应的完整列名
                            for key in claim_col_map:
                                if req in key or key in req:
                                    claim_col_map[key] = col_idx
                                    break
                            break

                for row in ws2.iter_rows(min_row=2, values_only=True):
                    if row[0] is None:
                        continue
                    # 使用映射提取数据，如果没有映射则按原始header名查找
                    row_dict = dict(zip(headers, row))

                    def get_val(keys, default=""):
                        """从row_dict中按多个可能的key名获取值"""
                        for k in keys:
                            if k in row_dict and row_dict[k] is not None:
                                v = str(row_dict[k])
                                if v != "None" and v != "nan":
                                    return v
                        return default

                    claim_data = {
                        "principal": get_val(["本金"]),
                        "rate_type": get_val(["利率类型"], "一年期LPR分段"),
                        "lpr_multiple": get_val(["LPR倍率(%)", "LPR倍率"], "100"),
                        "fixed_rate": get_val(["固定利率(%)", "固定利率"], ""),
                        "days_per_year": get_val(["一年天数"], "365"),
                        "start_date": get_val(["起算之日", "起算日期"], ""),
                        "end_date": get_val(["结算之日", "结算日期"], ""),
                    }
                    iv.add_claim_with_data(claim_data)
            else:
                iv.add_claim_with_data({})

            # 读取清偿记录
            if "清偿记录" in wb.sheetnames:
                ws3 = wb["清偿记录"]
                headers = [str(cell.value).strip() if cell.value else "" for cell in ws3[1]]
                for row in ws3.iter_rows(min_row=2, values_only=True):
                    if row[0] is None:
                        continue
                    row_dict = dict(zip(headers, row))

                    def get_val2(keys, default=""):
                        for k in keys:
                            if k in row_dict and row_dict[k] is not None:
                                v = str(row_dict[k])
                                if v != "None" and v != "nan":
                                    return v
                        return default

                    deduct_str = get_val2(["抵扣顺序"], "")
                    deduct_list = []
                    if deduct_str:
                        deduct_list = [item.strip() for item in deduct_str.split(",") if item.strip()]
                    payment_data = {
                        "amount": get_val2(["清偿金额", "金额"], ""),
                        "date": get_val2(["清偿时间", "时间"], ""),
                        "deduct_order": deduct_list,
                    }
                    iv.add_payment_with_data(payment_data)

            # 清除计算结果和保存状态
            self.interest_model.calc_result = None
            iv.clear_calc_result()
            iv.mark_unsaved()

            messagebox.showinfo("成功", "数据已成功导入！")
        except Exception as e:
            import traceback
            traceback.print_exc()
            messagebox.showerror("错误", f"导入失败: {e}\n请确认Excel文件格式正确，包含'基本信息'、'债权明细'、'清偿记录'三个工作表。")

    def copy_interest_preview(self):
        """复制利息计算预览到剪贴板"""
        if self.interest_model.calc_result is None:
            messagebox.showwarning("提示", "请先计算利息")
            return

        text_content = self.view.interest_view.get_result_text().strip()
        if text_content:
            import pyperclip
            pyperclip.copy(text_content)
            messagebox.showinfo("成功", "预览内容已复制到剪贴板")
        else:
            messagebox.showwarning("提示", "预览内容为空")

    def manage_lpr(self):
        """管理LPR利率数据"""
        dialog = tk.Toplevel(self.view.root)
        dialog.title("LPR利率管理")
        dialog.geometry("550x500")
        dialog.transient(self.view.root)
        dialog.grab_set()

        tk.Label(dialog, text="下方展示的LPR数据已去重，仅显示利率变动的记录", font=("仿宋", 10), fg="#666").pack(pady=5)

        list_frame = tk.Frame(dialog)
        list_frame.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)

        columns = ("日期", "一年期LPR", "五年期LPR")
        tree = ttk.Treeview(list_frame, columns=columns, show="headings", height=12)
        for col in columns:
            tree.heading(col, text=col)
            tree.column(col, width=150, anchor="center")

        vsb = tk.ttk.Scrollbar(list_frame, orient=tk.VERTICAL, command=tree.yview)
        tree.configure(yscrollcommand=vsb.set)
        tree.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        vsb.pack(side=tk.RIGHT, fill=tk.Y)

        def refresh_tree():
            for item in tree.get_children():
                tree.delete(item)

            sorted_lpr = sorted(LPR_DATA, key=lambda x: x["date"])
            last_one_year = None
            last_five_year = None
            unique_records = []

            for record in sorted_lpr:
                if record["one_year"] != last_one_year or record["five_year"] != last_five_year:
                    unique_records.append(record)
                    last_one_year = record["one_year"]
                    last_five_year = record["five_year"]

            if sorted_lpr and (not unique_records or unique_records[-1]["date"] != sorted_lpr[-1]["date"]):
                unique_records.append(sorted_lpr[-1])

            for record in unique_records:
                tree.insert("", tk.END, values=(record["date"], f"{record['one_year']}%", f"{record['five_year']}%"))

        refresh_tree()

        add_frame = tk.LabelFrame(dialog, text="添加最新LPR数据", font=("仿宋", 11, "bold"))
        add_frame.pack(fill=tk.X, padx=5, pady=5)

        row1 = tk.Frame(add_frame)
        row1.pack(fill=tk.X, padx=5, pady=3)
        tk.Label(row1, text="发布日期:", font=("仿宋", 11), width=10, anchor="e").pack(side=tk.LEFT)
        date_var = tk.StringVar(value=datetime.now().strftime("%Y-%m-%d"))
        date_entry = tk.Entry(row1, textvariable=date_var, width=15, font=("Arial", 11))
        date_entry.pack(side=tk.LEFT, padx=5)
        date_entry.bind("<FocusIn>", track_focus)

        row2 = tk.Frame(add_frame)
        row2.pack(fill=tk.X, padx=5, pady=3)
        tk.Label(row2, text="一年期LPR(%):", font=("仿宋", 11), width=10, anchor="e").pack(side=tk.LEFT)
        one_var = tk.StringVar()
        one_entry = tk.Entry(row2, textvariable=one_var, width=15, font=("Arial", 11))
        one_entry.pack(side=tk.LEFT, padx=5)
        one_entry.bind("<FocusIn>", track_focus)

        row3 = tk.Frame(add_frame)
        row3.pack(fill=tk.X, padx=5, pady=3)
        tk.Label(row3, text="五年期LPR(%):", font=("仿宋", 11), width=10, anchor="e").pack(side=tk.LEFT)
        five_var = tk.StringVar()
        five_entry = tk.Entry(row3, textvariable=five_var, width=15, font=("Arial", 11))
        five_entry.pack(side=tk.LEFT, padx=5)
        five_entry.bind("<FocusIn>", track_focus)

        btn_frame = tk.Frame(add_frame)
        btn_frame.pack(fill=tk.X, padx=5, pady=5)

        def add_lpr():
            try:
                date_str = date_var.get().strip()
                one_str = one_var.get().strip()
                five_str = five_var.get().strip()

                datetime.strptime(date_str, "%Y-%m-%d")

                if not one_str and not five_str:
                    messagebox.showerror("错误", "请至少输入一年期或五年期LPR利率")
                    return

                one_year = float(one_str) if one_str else None
                five_year = float(five_str) if five_str else None

                if one_year is None or five_year is None:
                    prev_record = None
                    for record in reversed(LPR_DATA):
                        if record["date"] <= date_str:
                            prev_record = record
                            break
                    if prev_record:
                        if one_year is None:
                            one_year = prev_record["one_year"]
                        if five_year is None:
                            five_year = prev_record["five_year"]
                    else:
                        messagebox.showerror("错误", "无法补全缺失的利率，请手动输入两个利率")
                        return

                existing_idx = None
                for i, record in enumerate(LPR_DATA):
                    if record["date"] == date_str:
                        existing_idx = i
                        break

                if existing_idx is not None:
                    if not messagebox.askyesno("确认", f"日期 {date_str} 的LPR数据已存在，是否覆盖？"):
                        return
                    LPR_DATA[existing_idx] = {"date": date_str, "one_year": one_year, "five_year": five_year}
                else:
                    new_record = {"date": date_str, "one_year": one_year, "five_year": five_year}
                    inserted = False
                    for i, record in enumerate(LPR_DATA):
                        if record["date"] > date_str:
                            LPR_DATA.insert(i, new_record)
                            inserted = True
                            break
                    if not inserted:
                        LPR_DATA.append(new_record)

                self._save_lpr_to_file()
                refresh_tree()
                one_var.set("")
                five_var.set("")
                messagebox.showinfo("成功", "LPR数据添加成功！")
            except ValueError as ve:
                messagebox.showerror("错误", f"数值格式错误: {ve}")
            except Exception as e:
                messagebox.showerror("错误", f"添加失败: {e}")

        def delete_lpr():
            selection = tree.selection()
            if not selection:
                messagebox.showwarning("提示", "请先选择要删除的记录")
                return
            item = tree.item(selection[0])
            date_str = item["values"][0]
            if messagebox.askyesno("确认", f"确定删除 {date_str} 的LPR记录吗？"):
                # 需要修改全局LPR_DATA
                global_list = LPR_DATA
                records_to_keep = [r for r in global_list if r["date"] != date_str]
                global_list.clear()
                global_list.extend(records_to_keep)
                self._save_lpr_to_file()
                refresh_tree()
                messagebox.showinfo("成功", "记录已删除")

        tk.Button(btn_frame, text="添加/更新", font=("仿宋", 11), command=add_lpr, bg="#5cb85c", fg="white").pack(side=tk.LEFT, padx=5)
        tk.Button(btn_frame, text="删除选中", font=("仿宋", 11), command=delete_lpr, bg="#d9534f", fg="white").pack(side=tk.LEFT, padx=5)

        lpr_file_path = self._get_lpr_file_path()
        tk.Label(dialog, text=f"数据保存路径: {lpr_file_path}", font=("Arial", 9), fg="#999", wraplength=500).pack(pady=5)

    def clear_interest(self):
        """清空利息计算的所有输入"""
        iv = self.view.interest_view
        if iv.has_unsaved_changes() and iv.get_loaded_case_no():
            if not messagebox.askyesno("提示", "当前有未保存的数据，清空后将丢失，是否继续？"):
                return

        iv.clear_all_inputs()
        self.interest_model.calc_result = None
        iv.clear_calc_result()
        iv.reset_state()

    def interest_case_selected(self, event=None):
        """利息模块案件库选择案件"""
        iv = self.view.interest_view
        case_no = iv.get_case_selector_value()
        if case_no and case_no in CASES_DB:
            if iv.has_unsaved_changes() and iv.get_loaded_case_no():
                if not messagebox.askyesno("提示", "当前数据有未保存的修改，加载新案件将丢失当前修改，是否继续？"):
                    iv.set_case_selector_value(iv.get_loaded_case_no() or "")
                    return
            self._fill_interest_form(CASES_DB[case_no])
            iv.set_loaded_case_no(case_no)
            iv.mark_saved(case_no)

    def add_claim(self):
        """添加债权行"""
        self.view.interest_view.add_claim()

    def add_payment(self):
        """添加清偿记录行"""
        self.view.interest_view.add_payment()

    def remove_claim(self, idx):
        """删除指定索引的债权"""
        self.view.interest_view.remove_claim(idx)

    def remove_payment(self, idx):
        """删除指定索引的清偿记录"""
        self.view.interest_view.remove_payment(idx)

    def set_payment_deduct_order(self, p_idx):
        """设置清偿抵扣顺序"""
        iv = self.view.interest_view
        payment_data = iv.get_payment_data_by_idx(p_idx)
        if payment_data is None:
            return

        dialog = tk.Toplevel(self.view.root)
        dialog.title("设置抵扣顺序")
        dialog.geometry("450x500")
        dialog.transient(self.view.root)
        dialog.grab_set()

        tk.Label(dialog, text="拖拽调整抵扣顺序（从上到下依次抵扣）:", font=("仿宋", 11, "bold")).pack(pady=5)

        listbox = tk.Listbox(dialog, font=("仿宋", 11), height=12)
        listbox.pack(fill=tk.BOTH, expand=True, padx=10, pady=5)

        claims_count = iv.get_claims_count()
        items = ["诉讼费用"]
        for i in range(claims_count):
            items.append(f"一般债务利息(债权{i+1})")
        for i in range(claims_count):
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
            iv.mark_unsaved()
            dialog.destroy()

        tk.Button(dialog, text="保存顺序", font=("仿宋", 11), command=save_order,
                  bg="#5cb85c", fg="white").pack(pady=5)

    # ==================== 计算器模块 ====================

    def calculate_expr(self):
        """计算数学表达式"""
        expr = self.view.calculator_view.get_expression()
        if not expr:
            self.view.calculator_view.set_result("0")
            self.view.calculator_view.set_exec_fee("0")
            return
        result = self.calc_model.evaluate_expression(expr)
        if result is not None:
            self.view.calculator_view.set_result(format_money(result))
            exec_fee = self.calc_model.calc_execution_fee(result)
            self.view.calculator_view.set_exec_fee(format_money(exec_fee))
            self.view.calculator_view.set_last_result(result)
            self.view.calculator_view.set_last_exec_fee(exec_fee)
        # result is None 时不修改结果（与v22.py一致：输入不完整表达式时保持上次结果）

    def calc_exec_fee(self):
        """计算执行费"""
        amount_str = self.view.calculator_view.get_expression()
        amount = parse_money(amount_str)
        if amount > 0:
            exec_fee = self.calc_model.calc_execution_fee(amount)
            self.view.calculator_view.set_exec_fee(format_money(exec_fee))
            self.view.calculator_view.set_last_exec_fee(exec_fee)

    def copy_calc_result(self):
        """复制计算结果到剪贴板"""
        result_str = self.view.calculator_view.get_result_text()
        if result_str and result_str != "0":
            import pyperclip
            pyperclip.copy(result_str)
            messagebox.showinfo("提示", "结果已复制到剪贴板")

    def copy_exec_fee(self):
        """复制执行费到剪贴板"""
        exec_str = self.view.calculator_view.get_exec_fee_text()
        if exec_str and exec_str != "0":
            import pyperclip
            pyperclip.copy(exec_str)
            messagebox.showinfo("提示", "执行费已复制到剪贴板")

    def clear_expr(self):
        """清空计算器"""
        self.view.calculator_view.clear()

    # ==================== 辅助方法 ====================

    def _refresh_case_selectors(self):
        """更新所有案件选择下拉框"""
        case_nos = get_all_case_nos()
        self.view.distribution_view.set_case_selector_values(case_nos)
        self.view.interest_view.set_case_selector_values(case_nos)

    def _get_dist_form_data(self):
        """从分配视图获取表单数据"""
        dv = self.view.distribution_view
        case_no = dv.get_form_case_no().strip()
        creditor = dv.get_form_creditor().strip()
        debtor = dv.get_form_debtor().strip()
        id_card = dv.get_form_id_card().strip()
        exec_basis = dv.get_form_exec_basis().strip()
        case_reason = dv.get_form_case_reason().strip()

        if not case_no:
            messagebox.showwarning("提示", "案号不能为空")
            return None

        return {
            "case_no": case_no,
            "creditor": creditor or "",
            "debtor": debtor or "",
            "id_card": id_card or "",
            "exec_basis": exec_basis or "",
            "case_reason": case_reason or "",
            "principal": parse_money(dv.get_form_principal()),
            "interest": parse_money(dv.get_form_interest()),
            "litigation_fee": parse_money(dv.get_form_litigation_fee()),
            "claim_type": dv.get_form_claim_type() or "第一顺位",
        }

    def _fill_dist_form(self, data):
        """用数据字典回填分配表单"""
        dv = self.view.distribution_view
        dv.set_form_case_no(data.get("case_no", ""))
        dv.set_form_creditor(data.get("creditor", ""))
        dv.set_form_debtor(data.get("debtor", ""))
        dv.set_form_id_card(data.get("id_card", ""))
        dv.set_form_exec_basis(data.get("exec_basis", ""))
        dv.set_form_case_reason(data.get("case_reason", ""))

        calc_result = data.get("calc_result", {})
        if calc_result:
            form_data = self.dist_model.get_form_data_from_calc(calc_result)
            dv.set_form_principal(str(form_data["principal"]))
            dv.set_form_interest(str(form_data["interest"]))
            dv.set_form_litigation_fee(str(form_data["litigation_fee"]))
        else:
            dv.set_form_principal(str(round(data.get("principal", 0), 2)))
            dv.set_form_interest(str(round(data.get("interest", 0), 2)))
            dv.set_form_litigation_fee(str(round(data.get("litigation_fee", 0), 2)))

        dv.set_form_claim_type(data.get("claim_type", "第一顺位"))

    def _refresh_dist_tree(self):
        """刷新分配列表"""
        dv = self.view.distribution_view
        dv.clear_tree()
        for case in self.dist_model.cases:
            dv.add_tree_row((
                case["id"], case["case_no"], case["creditor"], case["id_card"],
                case["debtor"], case["exec_basis"], case["case_reason"],
                format_money(case["principal"]), format_money(case["interest"]),
                format_money(case["litigation_fee"]), case["claim_type"],
            ))

    def _calculate_and_refresh_dist(self):
        """执行分配计算并刷新预览"""
        results, remaining = self.dist_model.calculate_distribution()
        dv = self.view.distribution_view

        if self.dist_model.total_amount <= 0 or not self.dist_model.cases:
            dv.set_result_text("请设置分配总金额并添加案件")
            return

        total_distributed = total_exec = total_actual = 0

        text = f"【分配方案预览】\n可分配总金额: {format_money(self.dist_model.total_amount)}元\n\n"
        for r in results:
            c = r["case"]
            text += f"案号: {c['case_no']} | 债权人: {c['creditor']}\n"
            text += f"  债权类型: {c['claim_type']} | 本金: {format_money(c['principal'])}元 | 利息: {format_money(c['interest'])}元\n"
            text += f"  分配金额: {format_money(r['distributed'])}元 | 执行费: {format_money(r['exec_fee'])}元\n"
            text += f"  实际发放: {format_money(r['actual'])}元\n\n"
            total_distributed += r["distributed"]
            total_exec += r["exec_fee"]
            total_actual += r["actual"]

        text += f"\n{'='*40}\n"
        text += f"分配总计: {format_money(total_distributed)}元\n"
        text += f"执行费总计: {format_money(total_exec)}元\n"
        text += f"实际发放总计: {format_money(total_actual)}元\n"
        text += f"剩余未分配: {format_money(remaining)}元"

        dv.set_result_text(text)

    def _get_interest_case_data(self):
        """从利息视图获取案件基本数据"""
        iv = self.view.interest_view
        case_no = iv.get_case_no().strip()
        creditor = iv.get_creditor().strip()
        debtor = iv.get_debtor().strip()
        case_reason = iv.get_case_reason().strip()
        id_card = iv.get_id_card().strip()
        exec_basis = iv.get_exec_basis().strip()

        if not case_no:
            messagebox.showwarning("提示", "案号不能为空")
            return None

        return {
            "case_no": case_no,
            "creditor": creditor or "",
            "debtor": debtor or "",
            "case_reason": case_reason or "",
            "id_card": id_card or "",
            "exec_basis": exec_basis or "",
            "other_fees": parse_money(iv.get_other_fees()),
            "litigation_fee": parse_money(iv.get_litigation_fee()),
            "interest_claim": parse_money(iv.get_interest_claim()),
        }

    def _fill_interest_form(self, data):
        """用数据库数据回填利息表单"""
        iv = self.view.interest_view
        iv.set_case_no(data.get("case_no", ""))
        iv.set_creditor(data.get("creditor", ""))
        iv.set_debtor(data.get("debtor", ""))
        iv.set_case_reason(data.get("case_reason", ""))
        iv.set_id_card(data.get("id_card", ""))
        iv.set_exec_basis(data.get("exec_basis", ""))
        iv.set_other_fees(str(data.get("other_fees", "")))
        iv.set_litigation_fee(str(data.get("litigation_fee", "")))
        iv.set_interest_claim(str(data.get("interest_claim", "")))

        calc = data.get("calc_result")
        if calc:
            iv.set_due_date(calc.get("due_date", datetime.now().strftime("%Y-%m-%d")))

            # 清空并重建债权
            iv.clear_claims()
            claims_data = calc.get("claims", [])
            if claims_data:
                for i, c in enumerate(claims_data):
                    claim_dict = {
                        "principal": str(c.get("principal", "")),
                        "rate_type": c.get("rate_type", "一年期LPR分段"),
                        "lpr_multiple": str(c.get("lpr_multiple", "100")),
                        "fixed_rate": str(c.get("fixed_rate", "")),
                        "days_per_year": str(c.get("days_per_year", "365")),
                        "start_date": c.get("start_date", ""),
                        "end_date": c.get("end_date", ""),
                    }
                    iv.add_claim_with_data(claim_dict)
            else:
                iv.add_claim_with_data({})

            # 清空并重建清偿记录
            iv.clear_payments()
            payments_data = calc.get("payments", [])
            for i, p in enumerate(payments_data):
                payment_dict = {
                    "amount": str(p.get("amount", "")),
                    "date": p.get("date", datetime.now().strftime("%Y-%m-%d")),
                    "deduct_order": p.get("deduct_order", []),
                }
                iv.add_payment_with_data(payment_dict)

            # 恢复计算结果
            self.interest_model.calc_result = calc
            self._display_interest_result(calc)
        else:
            self.interest_model.calc_result = None
            # 没有calc_result时，尝试从data顶层获取due_date
            due = data.get("due_date", "")
            if due:
                iv.set_due_date(due)

        iv.reset_state()

    def _display_interest_result(self, calc):
        """构建并显示利息计算结果文本"""
        if not calc:
            return

        claims = calc["claims"]
        iv = self.view.interest_view

        # 收集时间节点用于显示
        time_points = set()
        time_points.add(calc["due_date"])
        for c in claims:
            time_points.add(c["start_date"])
            time_points.add(c["end_date"])
        for p in calc.get("payments", []):
            time_points.add(p["date"])
        sorted_points = sorted(time_points, key=lambda x: datetime.strptime(x, "%Y-%m-%d"))

        text = f"【利息计算结果】\n\n"
        text += f"案号: {calc['case_no']}\n"
        text += f"申请执行人: {calc['creditor']}\n"
        text += f"被执行人: {calc['debtor']}\n"
        text += f"案由: {calc['case_reason']}\n"
        text += f"证件号: {calc.get('id_card', '')}\n"
        text += f"执行依据: {calc.get('exec_basis', '')}\n"
        text += f"履行期限届满之日: {calc['due_date']}\n\n"
        text += f"{'='*60}\n"
        text += "计算过程：按时间阶段滚动计算，清偿后立即更新剩余本金及各项费用，\n"
        text += "下一阶段基于更新后的状态继续计算。\n"
        text += "LPR分段优化：仅在LPR利率实际变动时分段，减少不必要的细分。\n"
        text += f"{'='*60}\n\n"
        text += f"时间节点: {' → '.join(sorted_points)}\n"
        text += f"共 {len(calc['stage_records'])} 个有效阶段\n\n"

        for s_record in calc["stage_records"]:
            si = s_record["start_state"]
            ei = s_record["end_state"]

            text += f"{'='*50}\n"
            text += f"【阶段 {si['stage_idx']+1}】{si['period']}  ({si['days']}天)\n"
            text += f"{'='*50}\n"

            text += "阶段开始时债务状态:\n"
            for ci in range(len(claims)):
                text += f"  债权{ci+1}: 剩余本金 {format_money(si['begin_principals'][ci])}元\n"
            text += f"  其他费用: {format_money(si['begin_other'])}元\n"
            text += f"  诉讼费用: {format_money(si['begin_litigation'])}元\n\n"

            if any(it["interest"] > 0 for it in si["interests_added"]):
                text += "本阶段新增一般债务利息:\n"
                for it in si["interests_added"]:
                    if it["interest"] > 0:
                        ci = it["idx"]
                        text += f"  债权{ci+1}计算公式:\n"
                        for d in it["details"]:
                            text += f"    {d['formula']}\n"
                        text += f"    本阶段合计: {format_money(it['interest'])}元\n"
            else:
                text += "本阶段无新增一般债务利息。\n"

            if si["delay_added"] > 0:
                text += f"\n本阶段新增延迟履行利息: {format_money(si['delay_added'])}元"
                dseg = next((ds for ds in calc.get("delay_segments", []) if ds["stage_idx"] == si["stage_idx"]), None)
                if dseg:
                    text += f"\n  计算公式: {dseg['formula']}"
                text += "\n"
            else:
                text += "本阶段无新增延迟履行利息。\n"

            if ei["payment_detail"]:
                pd = ei["payment_detail"]
                text += f"\n▶ 阶段末清偿: {format_money(pd['amount'])}元 ({pd['date']})\n"
                for ded in pd["deductions"]:
                    text += f"  抵扣 {ded['type']}: {format_money(ded['amount'])}元\n"
                text += "\n清偿后剩余债务:\n"
                for ci in range(len(claims)):
                    text += f"  债权{ci+1}: 剩余本金 {format_money(ei['end_principals'][ci])}元, 剩余利息 {format_money(ei['end_remaining_interest'][ci])}元\n"
                text += f"  其他费用: {format_money(ei['end_other'])}元\n"
                text += f"  诉讼费用: {format_money(ei['end_litigation'])}元\n"
                text += f"  延迟履行利息: {format_money(ei['end_delay'])}元\n"
            else:
                text += "\n阶段末无清偿，债务状态保持不变。\n"

            text += "\n"

        # 最终汇总
        text += f"{'='*60}\n"
        text += "最终债务汇总\n"
        text += f"{'='*60}\n"
        for ci, c in enumerate(claims):
            text += f"债权{ci+1}: 原始本金 {format_money(c['principal'])}元, 剩余本金 {format_money(c['remaining_principal'])}元\n"
            text += f"  累计一般债务利息 {format_money(c['general_interest'])}元, 已抵扣 {format_money(c['deducted_interest'])}元, 剩余 {format_money(c['general_interest'] - c['deducted_interest'])}元\n"
        text += f"其他费用: 原始 {format_money(calc['other_fees'])}元 → 剩余 {format_money(calc['remaining_other'])}元\n"
        text += f"诉讼费用: 原始 {format_money(calc['litigation_fee'])}元 → 剩余 {format_money(calc['remaining_litigation'])}元\n"
        text += f"延迟履行利息: 累计 {format_money(calc['total_delay'])}元, 已抵扣 {format_money(calc['deducted_delay'])}元, 剩余 {format_money(calc['remaining_delay'])}元\n"

        text += f"\n{'='*60}\n"
        text += "债务金额统计\n"
        text += f"{'='*60}\n"
        text += f"债务总金额 = {format_money(calc['total_principal'])}(本金) + {format_money(calc['total_general'])}(一般利息) + {format_money(calc['other_fees'])}(其他费用) + {format_money(calc['litigation_fee'])}(诉讼费用) + {format_money(calc['total_delay'])}(延迟利息)\n"
        text += f"         = {format_money(calc['debt_total'])}元\n\n"
        text += f"债务利息总金额 = {format_money(calc['debt_interest_total'])}元\n\n"
        text += f"尚待清偿利息总金额 = {format_money(calc['remaining_interest_total'])}元\n\n"
        if calc['total_payments_sum'] > 0:
            text += f"清偿金额之和 = {format_money(calc['total_payments_sum'])}元\n"
        text += f"尚待清偿债务总金额 = {format_money(calc['remaining_debt_total'])}元\n"

        text += f"\n{'='*60}\n"
        text += "执行费计算\n"
        text += f"{'='*60}\n"
        text += f"执行费计算基数 = {format_money(calc['exec_base'])}元\n"
        text += f"执行费 = {format_money(calc['exec_fee'])}元（直接舍去小数）\n"

        iv.set_result_text(text)

    def _get_lpr_file_path(self):
        """获取LPR数据文件路径"""
        from .utils import get_app_data_dir
        return os.path.join(get_app_data_dir(), "lpr_data.json")

    def _save_lpr_to_file(self):
        """保存LPR数据到文件"""
        from .utils import save_lpr_to_file
        save_lpr_to_file()

    # ==================== 利息模块缺失的功能 ====================

    def delete_interest_from_db(self):
        """删除选中的案件（二次确认）"""
        iv = self.view.interest_view
        case_no = iv.get_case_selector_value()
        if not case_no:
            messagebox.showwarning("提示", "请先从下拉框选择一个要删除的案件")
            return
        if case_no not in CASES_DB:
            messagebox.showwarning("提示", "该案件不在数据库中")
            return

        if messagebox.askyesno("确认删除", f"确定要删除案件【{case_no}】吗？\n此操作不可恢复！"):
            del CASES_DB[case_no]
            save_cases_db()
            self._refresh_case_selectors()
            iv.set_case_selector_value("")

            # 如果当前正在编辑的就是该案件，清空表单
            if iv.get_loaded_case_no() == case_no:
                iv.clear_all_inputs()
                self.interest_model.calc_result = None
                iv.clear_calc_result()
                iv.reset_state()

            messagebox.showinfo("成功", f"案件【{case_no}】已删除")

    def toggle_interest_search(self):
        """切换案件库下拉框为检索输入模式"""
        iv = self.view.interest_view
        if iv.search_entry.winfo_viewable():
            # 当前为检索模式，执行检索
            self._do_interest_search()
        else:
            # 进入检索模式
            iv.toggle_search_ui(show_search=True)

    def _do_interest_search(self, event=None):
        """根据输入关键词检索案件库并更新下拉框"""
        iv = self.view.interest_view
        keyword = iv.get_search_keyword()

        # 恢复下拉框模式
        iv.toggle_search_ui(show_search=False)

        if not keyword:
            all_cases = get_all_case_nos()
            iv.set_case_selector_values(all_cases)
            return "break"

        # 过滤案件
        matched = []
        for case_no, data in CASES_DB.items():
            search_text = f"{case_no} {data.get('creditor', '')} {data.get('debtor', '')} {data.get('case_reason', '')}"
            if keyword in search_text:
                matched.append(case_no)

        if not matched:
            messagebox.showinfo("提示", f"未找到包含 '{keyword}' 的案件")
            all_cases = get_all_case_nos()
            iv.set_case_selector_values(all_cases)
            return "break"

        iv.set_case_selector_values(matched, matched[0] if len(matched) == 1 else "")
        if len(matched) == 1:
            self.interest_case_selected()

        return "break"

    def search_interest_case(self, event=None):
        """检索回调（回车触发）"""
        self._do_interest_search(event)

    def interest_data_changed(self):
        """数据变更时标记未保存"""
        self.view.interest_view.mark_unsaved()
