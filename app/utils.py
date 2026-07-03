import re
import json
import os
import sys
from datetime import datetime, timedelta


def get_app_data_dir():
    if getattr(sys, 'frozen', False):
        return os.path.dirname(sys.executable)
    else:
        # __file__ 是 app/utils.py，需要向上一级到项目根目录
        return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


# ==================== 全局配置 ====================

WINDOW_WIDTH = 1280
WINDOW_HEIGHT = 600
CLIPBOARD_PANEL_WIDTH = 200

# 全局变量：记录最后聚焦的输入控件
LAST_FOCUSED_WIDGET = None

# 全局案件数据库 {案号: {字段字典}}
CASES_DB = {}
APP_DATA_DIR = get_app_data_dir()
CASES_DB_FILE = os.path.join(APP_DATA_DIR, "cases_db.json")


def track_focus(event):
    """全局焦点追踪：记录最后获得焦点的输入控件"""
    global LAST_FOCUSED_WIDGET
    widget = event.widget
    if isinstance(widget, (tk.Entry, tk.Text, ttk.Combobox)):
        LAST_FOCUSED_WIDGET = widget


def get_all_input_widgets(parent):
    """递归获取一个容器中的所有输入控件（Entry, Text, Combobox, DateEntry等）"""
    import tkinter as tk
    from tkinter import ttk
    widgets = []
    for child in parent.winfo_children():
        if isinstance(child, (tk.Entry, tk.Text, ttk.Combobox)):
            widgets.append(child)
        # 检查是否是DateEntry（它继承自Frame，需要特殊处理）
        elif child.__class__.__name__ == "DateEntry":
            # DateEntry内部有Entry，获取它的子控件中的Entry
            for subchild in child.winfo_children():
                if isinstance(subchild, tk.Entry):
                    widgets.append(subchild)
        else:
            # 递归查找子控件
            widgets.extend(get_all_input_widgets(child))
    return widgets


def get_widget_position_in_container(widget, container=None):
    """获取控件在其父容器中的所有输入控件中的位置索引"""
    if container is None:
        container = widget.master
    all_inputs = get_all_input_widgets(container)
    try:
        return all_inputs.index(widget)
    except ValueError:
        return -1


def move_focus_to_next(current, direction="next"):
    """移动焦点到下一个/上一个输入控件"""
    parent = current.master
    all_inputs = get_all_input_widgets(parent)

    try:
        current_idx = all_inputs.index(current)
        if direction == "next":
            target_idx = (current_idx + 1) % len(all_inputs)
        else:  # prev
            target_idx = (current_idx - 1) % len(all_inputs)
        target_widget = all_inputs[target_idx]
        target_widget.focus_set()
        return True
    except ValueError:
        return False


def move_focus_by_arrow(current, direction):
    """
    根据方向键移动焦点
    direction: "up", "down", "left", "right"
    左右移动：在同一行内移动（按tab顺序）
    上下移动：尝试找到相同列位置的上一行/下一行控件
    """
    parent = current.master

    # 获取当前控件的位置信息
    try:
        current_x = current.winfo_x()
        current_y = current.winfo_y()
        current_width = current.winfo_width()
        current_height = current.winfo_height()
        current_center_x = current_x + current_width // 2
    except:
        return move_focus_to_next(current, "next" if direction == "right" else "prev")

    all_inputs = get_all_input_widgets(parent)

    if direction == "left":
        # 向左：找x坐标小于当前控件且最接近的控件
        candidates = [w for w in all_inputs if w != current and w.winfo_x() < current_x]
        if candidates:
            target = min(candidates, key=lambda w: current_x - w.winfo_x())
            target.focus_set()
            return True
        else:
            return move_focus_to_next(current, "prev")

    elif direction == "right":
        # 向右：找x坐标大于当前控件且最接近的控件
        candidates = [w for w in all_inputs if w != current and w.winfo_x() > current_x]
        if candidates:
            target = min(candidates, key=lambda w: w.winfo_x() - current_x)
            target.focus_set()
            return True
        else:
            return move_focus_to_next(current, "next")

    elif direction == "up":
        # 向上：找y坐标小于当前控件，且x坐标接近的控件
        candidates = []
        for w in all_inputs:
            if w != current:
                try:
                    w_center_x = w.winfo_x() + w.winfo_width() // 2
                    if w.winfo_y() < current_y and abs(w_center_x - current_center_x) < 100:
                        candidates.append(w)
                except:
                    pass
        if candidates:
            target = max(candidates, key=lambda w: w.winfo_y())  # y最大最接近当前
            target.focus_set()
            return True

    elif direction == "down":
        # 向下：找y坐标大于当前控件，且x坐标接近的控件
        candidates = []
        for w in all_inputs:
            if w != current:
                try:
                    w_center_x = w.winfo_x() + w.winfo_width() // 2
                    if w.winfo_y() > current_y and abs(w_center_x - current_center_x) < 100:
                        candidates.append(w)
                except:
                    pass
        if candidates:
            target = min(candidates, key=lambda w: w.winfo_y())  # y最小最接近当前
            target.focus_set()
            return True

    return False


def handle_enter_key(event):
    """处理Enter键：跳转到下一个输入框"""
    import tkinter as tk
    from tkinter import ttk
    widget = event.widget
    if isinstance(widget, (tk.Entry, tk.Text, ttk.Combobox)):
        # 如果是在Text控件中，需要检查是否按下了Shift（用于换行）
        if isinstance(widget, tk.Text):
            if event.state & 0x0001:  # Shift键按下
                return  # 允许换行
        move_focus_to_next(widget, "next")
        return "break"  # 阻止默认行为


def handle_tab_key(event):
    """处理Tab键：跳转到下一个输入框（标准行为）"""
    # Tab键默认行为就是跳转，但为了统一处理，也可以调用我们的函数
    move_focus_to_next(event.widget, "next")
    return "break"


def handle_arrow_key(event):
    """处理方向键：根据方向跳转（左右键同行切换，上下键同列切换）"""
    import tkinter as tk
    from tkinter import ttk
    direction_map = {
        "Up": "up",
        "Down": "down",
        "Left": "left",
        "Right": "right"
    }
    key = event.keysym
    if key in direction_map:
        widget = event.widget

        # 处理Text控件
        if isinstance(widget, tk.Text):
            if event.state & 0x20000:  # Alt键按下时跳转控件
                move_focus_by_arrow(widget, direction_map[key])
                return "break"
            else:
                return  # 允许正常的文本光标移动

        # 处理Entry和Combobox控件
        elif isinstance(widget, (tk.Entry, ttk.Combobox)):
            # 左右键：优先在字符间移动，到头后同行左右切换
            if key in ("Left", "Right"):
                try:
                    current_pos = widget.index(tk.INSERT)
                    if key == "Left" and current_pos > 0:
                        # 光标不在开头，移动光标到左边字符
                        return
                    if key == "Right" and current_pos < len(widget.get()):
                        # 光标不在结尾，移动光标到右边字符
                        return
                except:
                    pass
                # 光标已在边界，同行左右切换（Left上一个，Right下一个）
                move_focus_to_next(widget, "prev" if key == "Left" else "next")
                return "break"
            else:
                # 上下键：垂直切换（找同列位置的上下行控件）
                move_focus_by_arrow(widget, direction_map[key])
                return "break"


# ==================== 案件数据库操作 ====================

LPR_DATA_FILE = os.path.join(APP_DATA_DIR, "lpr_data.json")


def load_lpr_from_file():
    """从本地JSON加载LPR数据（启动时调用）"""
    try:
        if os.path.exists(LPR_DATA_FILE):
            with open(LPR_DATA_FILE, "r", encoding="utf-8") as f:
                loaded = json.load(f)
                if loaded and isinstance(loaded, list):
                    if all(all(k in item for k in ["date", "one_year", "five_year"]) for item in loaded):
                        # 使用clear+extend而非赋值，避免其他模块的from引用失效
                        LPR_DATA.clear()
                        LPR_DATA.extend(loaded)
    except Exception:
        pass


def save_lpr_to_file():
    """保存LPR数据到本地JSON"""
    try:
        with open(LPR_DATA_FILE, "w", encoding="utf-8") as f:
            json.dump(LPR_DATA, f, ensure_ascii=False, indent=2)
    except Exception as e:
        from tkinter import messagebox
        messagebox.showerror("错误", f"保存LPR数据失败: {e}")


def load_cases_db():
    """从本地JSON加载案件数据库"""
    global CASES_DB
    try:
        if os.path.exists(CASES_DB_FILE):
            with open(CASES_DB_FILE, "r", encoding="utf-8") as f:
                loaded = json.load(f)
                if isinstance(loaded, dict):
                    # 使用clear+update而非赋值，避免其他模块的from引用失效
                    CASES_DB.clear()
                    CASES_DB.update(loaded)
    except Exception:
        # 不重新赋值，保持原dict对象
        CASES_DB.clear()


def save_cases_db():
    """保存案件数据库到本地JSON"""
    from tkinter import messagebox
    try:
        with open(CASES_DB_FILE, "w", encoding="utf-8") as f:
            json.dump(CASES_DB, f, ensure_ascii=False, indent=2)
    except Exception as e:
        messagebox.showerror("错误", f"保存案件数据库失败: {e}")


def get_case(case_no):
    """获取案件，返回字典副本"""
    return CASES_DB.get(case_no, {}).copy()


def save_case(data):
    """保存/更新案件到数据库"""
    if not data or not data.get("case_no"):
        return False
    data["last_modified"] = datetime.now().isoformat()
    CASES_DB[data["case_no"]] = data.copy()
    save_cases_db()
    return True


def get_all_case_nos():
    """获取所有案号列表（最近修改的优先，其次按字母排序）"""
    items = []
    for case_no, case_data in CASES_DB.items():
        last_modified = case_data.get("last_modified", "1970-01-01T00:00:00")
        items.append((last_modified, case_no))

    # 先按案号升序（次要排序），再按时间降序（主要排序，稳定排序保证同时间按案号序）
    items.sort(key=lambda x: x[1])
    items.sort(key=lambda x: x[0], reverse=True)
    return [case_no for _, case_no in items]


def merge_case_data(module_data):
    """
    将模块数据合并到数据库现有案件（如果有）
    返回合并后的完整数据
    """
    case_no = module_data.get("case_no")
    if not case_no or case_no not in CASES_DB:
        return module_data

    existing = CASES_DB[case_no].copy()
    # 用新数据覆盖，但保留数据库中已有的其他字段
    for k, v in module_data.items():
        if v is not None and v != "" and v != 0:
            existing[k] = v
    return existing


# ==================== LPR历史数据 ====================
LPR_DATA = [
    {"date": "2019-08-20", "one_year": 4.25, "five_year": 4.85},
    {"date": "2019-09-20", "one_year": 4.20, "five_year": 4.85},
    {"date": "2019-10-21", "one_year": 4.20, "five_year": 4.85},
    {"date": "2019-11-20", "one_year": 4.15, "five_year": 4.80},
    {"date": "2019-12-20", "one_year": 4.15, "five_year": 4.80},
    {"date": "2020-01-20", "one_year": 4.15, "five_year": 4.80},
    {"date": "2020-02-20", "one_year": 4.05, "five_year": 4.75},
    {"date": "2020-03-20", "one_year": 4.05, "five_year": 4.75},
    {"date": "2020-04-20", "one_year": 3.85, "five_year": 4.65},
    {"date": "2020-05-20", "one_year": 3.85, "five_year": 4.65},
    {"date": "2020-06-22", "one_year": 3.85, "five_year": 4.65},
    {"date": "2020-07-20", "one_year": 3.85, "five_year": 4.65},
    {"date": "2020-08-20", "one_year": 3.85, "five_year": 4.65},
    {"date": "2020-09-21", "one_year": 3.85, "five_year": 4.65},
    {"date": "2020-10-20", "one_year": 3.85, "five_year": 4.65},
    {"date": "2020-11-20", "one_year": 3.85, "five_year": 4.65},
    {"date": "2020-12-21", "one_year": 3.85, "five_year": 4.65},
    {"date": "2021-01-20", "one_year": 3.85, "five_year": 4.65},
    {"date": "2021-02-20", "one_year": 3.85, "five_year": 4.65},
    {"date": "2021-03-22", "one_year": 3.85, "five_year": 4.65},
    {"date": "2021-04-20", "one_year": 3.85, "five_year": 4.65},
    {"date": "2021-05-20", "one_year": 3.85, "five_year": 4.65},
    {"date": "2021-06-21", "one_year": 3.85, "five_year": 4.65},
    {"date": "2021-07-20", "one_year": 3.85, "five_year": 4.65},
    {"date": "2021-08-20", "one_year": 3.85, "five_year": 4.65},
    {"date": "2021-09-22", "one_year": 3.85, "five_year": 4.65},
    {"date": "2021-10-20", "one_year": 3.85, "five_year": 4.65},
    {"date": "2021-11-22", "one_year": 3.85, "five_year": 4.65},
    {"date": "2021-12-20", "one_year": 3.80, "five_year": 4.65},
    {"date": "2022-01-20", "one_year": 3.70, "five_year": 4.60},
    {"date": "2022-02-21", "one_year": 3.70, "five_year": 4.60},
    {"date": "2022-03-21", "one_year": 3.70, "five_year": 4.60},
    {"date": "2022-04-20", "one_year": 3.70, "five_year": 4.60},
    {"date": "2022-05-20", "one_year": 3.70, "five_year": 4.60},
    {"date": "2022-06-20", "one_year": 3.70, "five_year": 4.45},
    {"date": "2022-07-20", "one_year": 3.70, "five_year": 4.45},
    {"date": "2022-08-22", "one_year": 3.65, "five_year": 4.30},
    {"date": "2022-09-20", "one_year": 3.65, "five_year": 4.30},
    {"date": "2022-10-20", "one_year": 3.65, "five_year": 4.30},
    {"date": "2022-11-21", "one_year": 3.65, "five_year": 4.30},
    {"date": "2022-12-20", "one_year": 3.65, "five_year": 4.30},
    {"date": "2023-01-20", "one_year": 3.65, "five_year": 4.30},
    {"date": "2023-02-20", "one_year": 3.65, "five_year": 4.30},
    {"date": "2023-03-20", "one_year": 3.65, "five_year": 4.30},
    {"date": "2023-04-20", "one_year": 3.65, "five_year": 4.30},
    {"date": "2023-05-22", "one_year": 3.65, "five_year": 4.30},
    {"date": "2023-06-20", "one_year": 3.55, "five_year": 4.20},
    {"date": "2023-07-20", "one_year": 3.55, "five_year": 4.20},
    {"date": "2023-08-21", "one_year": 3.45, "five_year": 4.20},
    {"date": "2023-09-20", "one_year": 3.45, "five_year": 4.20},
    {"date": "2023-10-20", "one_year": 3.45, "five_year": 4.20},
    {"date": "2023-11-20", "one_year": 3.45, "five_year": 4.20},
    {"date": "2023-12-20", "one_year": 3.45, "five_year": 4.20},
    {"date": "2024-01-22", "one_year": 3.45, "five_year": 4.20},
    {"date": "2024-02-20", "one_year": 3.45, "five_year": 4.20},
    {"date": "2024-03-20", "one_year": 3.45, "five_year": 3.95},
    {"date": "2024-04-22", "one_year": 3.45, "five_year": 3.95},
    {"date": "2024-05-20", "one_year": 3.45, "five_year": 3.95},
    {"date": "2024-06-20", "one_year": 3.45, "five_year": 3.95},
    {"date": "2024-07-22", "one_year": 3.35, "five_year": 3.85},
    {"date": "2024-08-20", "one_year": 3.35, "five_year": 3.85},
    {"date": "2024-09-20", "one_year": 3.35, "five_year": 3.85},
    {"date": "2024-10-21", "one_year": 3.10, "five_year": 3.60},
    {"date": "2024-11-20", "one_year": 3.10, "five_year": 3.60},
    {"date": "2024-12-20", "one_year": 3.10, "five_year": 3.60},
    {"date": "2025-01-20", "one_year": 3.10, "five_year": 3.60},
    {"date": "2025-02-20", "one_year": 3.10, "five_year": 3.60},
    {"date": "2025-03-20", "one_year": 3.10, "five_year": 3.60},
    {"date": "2025-04-21", "one_year": 3.10, "five_year": 3.60},
    {"date": "2025-05-20", "one_year": 3.00, "five_year": 3.50},
]

# ==================== 工具函数 ====================

def calc_execution_fee(amount):
    """计算执行费（直接舍去小数，与1.41一致）"""
    if amount <= 0:
        return 0
    if amount <= 10000:
        return 50
    elif amount <= 500000:
        return int(50 + (amount - 10000) * 0.015)
    elif amount <= 5000000:
        return int(50 + 490000 * 0.015 + (amount - 500000) * 0.01)
    elif amount <= 10000000:
        return int(50 + 490000 * 0.015 + 4500000 * 0.01 + (amount - 5000000) * 0.005)
    else:
        return int(50 + 490000 * 0.015 + 4500000 * 0.01 + 5000000 * 0.005 + (amount - 10000000) * 0.001)


def format_money(value):
    """格式化金额"""
    if value is None:
        return ""
    return f"{value:,.2f}"


def parse_money(text):
    """解析金额文本"""
    if not text:
        return 0
    text = str(text).replace(",", "").replace("，", "").strip()
    try:
        return float(text)
    except:
        return 0


def set_cell_font(cell, font_name="仿宋", font_size=16, bold=False):
    """设置单元格字体"""
    from docx.shared import Pt
    from docx.oxml.ns import qn
    for paragraph in cell.paragraphs:
        for run in paragraph.runs:
            run.font.name = font_name
            run.font.size = Pt(font_size)
            run.font.bold = bold
            run._element.rPr.rFonts.set(qn('w:eastAsia'), font_name)


def set_run_font(run, font_name="仿宋", font_size=16, bold=False):
    """设置run字体"""
    from docx.shared import Pt
    from docx.oxml.ns import qn
    run.font.name = font_name
    run.font.size = Pt(font_size)
    run.font.bold = bold
    run._element.rPr.rFonts.set(qn('w:eastAsia'), font_name)


def days_between(d1, d2):
    """计算两个日期之间的天数"""
    if isinstance(d1, str):
        d1 = datetime.strptime(d1, "%Y-%m-%d")
    if isinstance(d2, str):
        d2 = datetime.strptime(d2, "%Y-%m-%d")
    return (d2 - d1).days


def get_lpr_segments(start_date, end_date, lpr_type="one_year"):
    """获取LPR分段"""
    if isinstance(start_date, str):
        start_date = datetime.strptime(start_date, "%Y-%m-%d")
    if isinstance(end_date, str):
        end_date = datetime.strptime(end_date, "%Y-%m-%d")

    segments = []
    current_date = start_date

    for i, record in enumerate(LPR_DATA):
        record_date = datetime.strptime(record["date"], "%Y-%m-%d")
        if record_date <= start_date:
            continue
        if record_date > end_date:
            if current_date < end_date:
                segments.append({
                    "start": current_date.strftime("%Y-%m-%d"),
                    "end": end_date.strftime("%Y-%m-%d"),
                    "rate": LPR_DATA[i-1][lpr_type] if i > 0 else record[lpr_type],
                    "days": (end_date - current_date).days
                })
            break
        if current_date < record_date:
            segments.append({
                "start": current_date.strftime("%Y-%m-%d"),
                "end": (record_date - timedelta(days=1)).strftime("%Y-%m-%d"),
                "rate": LPR_DATA[i-1][lpr_type] if i > 0 else record[lpr_type],
                "days": (record_date - current_date).days
            })
            current_date = record_date
    else:
        if current_date < end_date:
            segments.append({
                "start": current_date.strftime("%Y-%m-%d"),
                "end": end_date.strftime("%Y-%m-%d"),
                "rate": LPR_DATA[-1][lpr_type],
                "days": (end_date - current_date).days
            })

    return segments


def to_chinese_date(dt):
    """
    将 datetime 对象转换为中文日期格式
    如: 2026-05-10 -> 二〇二六年五月十日
    """
    cn_nums = {'0': '〇', '1': '一', '2': '二', '3': '三', '4': '四',
               '5': '五', '6': '六', '7': '七', '8': '八', '9': '九'}

    # 年份逐位转换
    year_str = ''.join([cn_nums[ch] for ch in str(dt.year)])

    # 月份转换
    month = dt.month
    if month <= 10:
        month_str = cn_nums[str(month)] if month < 10 else '十'
    else:
        month_str = '十' + cn_nums[str(month - 10)]

    # 日期转换
    day = dt.day
    if day < 10:
        day_str = cn_nums[str(day)]
    elif day == 10:
        day_str = '十'
    elif day < 20:
        day_str = '十' + cn_nums[str(day - 10)]
    elif day == 20:
        day_str = '二十'
    elif day < 30:
        day_str = '二十' + cn_nums[str(day - 20)]
    elif day == 30:
        day_str = '三十'
    else:
        day_str = '三十一'

    return f"{year_str}年{month_str}月{day_str}日"
