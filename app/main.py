"""
熊爵执行小助手 v2 - MVC重构版
法院执行案件辅助工具
"""

import sys
import os

# 确保应用目录在路径中
app_dir = os.path.dirname(os.path.abspath(__file__))
if app_dir not in sys.path:
    sys.path.insert(0, os.path.dirname(app_dir))

from app.utils import load_cases_db, load_lpr_from_file, WINDOW_WIDTH, WINDOW_HEIGHT
from app.view import MainView
from app.controller import AppController


def main():
    # 加载案件数据库
    load_cases_db()

    # 加载本地LPR数据（覆盖默认值）
    load_lpr_from_file()

    # 创建视图
    view = MainView()

    # 创建控制器（连接Model和View）
    controller = AppController(view)

    # 启动主循环
    view.run()


if __name__ == "__main__":
    main()
