"""
Model层 - MVC架构的业务逻辑和数据计算
不包含任何UI代码
"""

import re
from datetime import datetime, timedelta
from .utils import (
    LPR_DATA, calc_execution_fee, format_money, parse_money, days_between,
    get_lpr_segments, to_chinese_date, CASES_DB, get_case, save_case,
    get_all_case_nos, merge_case_data, load_cases_db, save_cases_db
)


class DistributionModel:
    """分配方案计算模型"""

    def __init__(self):
        self.cases = []
        self.total_amount = 0
        self.distribution_results = []

    def add_case(self, case_data):
        """添加案件，返回带id的案件字典"""
        case_data["id"] = len(self.cases) + 1
        self.cases.append(case_data)
        return case_data

    def update_case(self, idx, case_data):
        """更新指定索引的案件"""
        if 0 <= idx < len(self.cases):
            case_data["id"] = self.cases[idx]["id"]
            self.cases[idx] = case_data

    def delete_case(self, idx):
        """删除指定索引的案件，并重新编号"""
        if 0 <= idx < len(self.cases):
            del self.cases[idx]
            for i, c in enumerate(self.cases):
                c["id"] = i + 1

    def clear_cases(self):
        """清空所有案件"""
        self.cases = []
        self.total_amount = 0
        self.distribution_results = []

    def set_total_amount(self, amount):
        """设置分配总金额"""
        self.total_amount = amount

    def calculate_distribution(self):
        """
        执行分配计算
        逻辑与原始代码 lines 1259-1329 完全一致
        Returns: (results, remaining) 分配结果列表和剩余金额
        """
        if self.total_amount <= 0 or not self.cases:
            return ([], 0)

        order_map = {
            "第一顺位": 1, "第一顺位债权": 1,
            "第二顺位": 2, "第二顺位债权": 2,
            "第三顺位": 3, "第三顺位债权": 3,
            "第四顺位": 4, "第四顺位债权": 4
        }

        results = []
        for c in self.cases:
            results.append({
                "case": c,
                "distributed": 0,
                "exec_fee": 0,
                "actual": 0,
            })

        remaining = self.total_amount

        # 先按比例扣除诉讼费
        total_litigation = sum(c["litigation_fee"] for c in self.cases)
        if total_litigation > 0:
            if remaining >= total_litigation:
                for r in results:
                    r["actual"] = r["case"]["litigation_fee"]
                remaining -= total_litigation
            else:
                ratio = remaining / total_litigation
                for r in results:
                    r["actual"] = r["case"]["litigation_fee"] * ratio
                remaining = 0
                self.distribution_results = results
                return (results, remaining)

        # 按顺位分配
        debt_order = ["第一顺位", "第二顺位", "第三顺位", "第四顺位"]
        for debt_type in debt_order:
            current_results = [
                r for r in results
                if order_map.get(r["case"]["claim_type"], 99) == order_map[debt_type]
            ]
            if not current_results:
                continue

            total_claim = sum(r["case"]["principal"] + r["case"]["interest"] for r in current_results)
            if remaining <= 0 or total_claim == 0:
                continue

            if remaining >= total_claim:
                for r in current_results:
                    amount = r["case"]["principal"] + r["case"]["interest"]
                    r["distributed"] = amount
                    r["exec_fee"] = calc_execution_fee(amount)
                    r["actual"] = r["case"]["litigation_fee"] + (amount - r["exec_fee"])
                remaining -= total_claim
            else:
                ratio = remaining / total_claim
                for r in current_results:
                    amount = (r["case"]["principal"] + r["case"]["interest"]) * ratio
                    r["distributed"] = amount
                    r["exec_fee"] = calc_execution_fee(amount)
                    r["actual"] = r["case"]["litigation_fee"] + (amount - r["exec_fee"])
                remaining = 0
                break

        self.distribution_results = results
        return (results, remaining)

    def get_form_data_from_calc(self, calc_result):
        """
        从计算结果中提取本金、利息、诉讼费（与原始fill_form逻辑一致）
        Returns: dict with principal, interest, litigation_fee
        """
        if calc_result:
            principal = round(calc_result.get("total_remaining_principal", 0) +
                              calc_result.get("remaining_other", 0), 2)
            interest = round(calc_result.get("total_remaining_interest", 0), 2)
            litigation_fee = round(calc_result.get("remaining_litigation", 0), 2)
        else:
            principal = 0
            interest = 0
            litigation_fee = 0
        return {
            "principal": principal,
            "interest": interest,
            "litigation_fee": litigation_fee,
        }

    def export_to_excel_data(self):
        """
        生成导出Excel所需的数据字典
        Returns: (import_data, result_data) 两个列表，每个元素是字典
        """
        import_data = []
        for case in self.cases:
            import_data.append({
                "案号": case["case_no"],
                "债权人": case["creditor"],
                "债务人": case["debtor"],
                "证件号": case["id_card"],
                "执行依据": case["exec_basis"],
                "案由": case["case_reason"],
                "本金": case["principal"],
                "利息": case["interest"],
                "诉讼费": case["litigation_fee"],
                "债权类型": case["claim_type"],
            })

        result_data = []
        total_claim = 0
        total_cost = 0
        total_allocation = 0
        total_execution_fee = 0
        total_actual = 0

        if self.distribution_results:
            for r in self.distribution_results:
                c = r["case"]
                claim_amount = c["principal"] + c["interest"] + c["litigation_fee"]
                result_data.append({
                    "案号": c["case_no"],
                    "申请执行人": c["creditor"],
                    "申请执行标的金额": claim_amount,
                    "诉讼费": c["litigation_fee"],
                    "本案分配金额": r["distributed"],
                    "执行费": r["exec_fee"],
                    "实际发放金额": r["actual"],
                })
                total_claim += claim_amount
                total_cost += c["litigation_fee"]
                total_allocation += r["distributed"]
                total_execution_fee += r["exec_fee"]
                total_actual += r["actual"]

            # 总计行
            result_data.append({
                "案号": "总计",
                "申请执行人": "",
                "申请执行标的金额": total_claim,
                "诉讼费": total_cost,
                "本案分配金额": total_allocation,
                "执行费": total_execution_fee,
                "实际发放金额": total_actual,
            })

        return (import_data, result_data)

    def import_excel_row(self, row_dict):
        """
        将Excel行字典转换为案件字典
        row_dict: 从Excel读取的行数据（键为中文列名）
        Returns: case dict
        """
        case = {
            "id": 0,  # 由add_case设置
            "case_no": str(row_dict.get("案号", "")),
            "creditor": str(row_dict.get("债权人", "")),
            "debtor": str(row_dict.get("债务人", "")),
            "id_card": str(row_dict.get("证件号", "")),
            "exec_basis": str(row_dict.get("执行依据", "")),
            "case_reason": str(row_dict.get("案由", "")),
            "principal": parse_money(row_dict.get("本金", 0)),
            "interest": parse_money(row_dict.get("利息", 0)),
            "litigation_fee": parse_money(row_dict.get("诉讼费", 0)),
            "claim_type": str(row_dict.get("债权类型", "第一顺位")),
        }
        # 规范化债权类型
        claim_type = case["claim_type"]
        if "第一" in claim_type:
            case["claim_type"] = "第一顺位"
        elif "第二" in claim_type:
            case["claim_type"] = "第二顺位"
        elif "第三" in claim_type:
            case["claim_type"] = "第三顺位"
        elif "第四" in claim_type:
            case["claim_type"] = "第四顺位"

        return case


class InterestModel:
    """利息计算模型"""

    def __init__(self):
        self.claims = []
        self.payments = []
        self.calc_result = None

    def get_lpr_segments_optimized(self, start_date, end_date, lpr_type="one_year"):
        """
        获取优化的LPR分段：只在LPR利率实际变动时才分段
        逻辑与原始代码 lines 2699-2769 完全一致
        """
        if isinstance(start_date, str):
            start_date = datetime.strptime(start_date, "%Y-%m-%d")
        if isinstance(end_date, str):
            end_date = datetime.strptime(end_date, "%Y-%m-%d")

        sorted_lpr = sorted(LPR_DATA, key=lambda x: x["date"])

        # 去重：如果相邻记录的利率相同，只保留第一个
        unique_lpr = []
        last_one_year = None
        last_five_year = None

        for record in sorted_lpr:
            if record["one_year"] != last_one_year or record["five_year"] != last_five_year:
                unique_lpr.append(record)
                last_one_year = record["one_year"]
                last_five_year = record["five_year"]

        # 找到起始日期之前最近的LPR
        current_rate = None
        for record in reversed(unique_lpr):
            record_date = datetime.strptime(record["date"], "%Y-%m-%d")
            if record_date <= start_date:
                current_rate = record[lpr_type]
                break

        if current_rate is None:
            current_rate = unique_lpr[0][lpr_type] if unique_lpr else 3.85

        last_rate = current_rate
        change_dates = []
        change_rates = []

        for record in unique_lpr:
            record_date = datetime.strptime(record["date"], "%Y-%m-%d")
            if start_date < record_date <= end_date:
                new_rate = record[lpr_type]
                if new_rate != last_rate:
                    change_dates.append(record_date)
                    change_rates.append(new_rate)
                    last_rate = new_rate

        segments = []
        segment_start = start_date

        for i, change_date in enumerate(change_dates):
            if segment_start < change_date:
                rate = current_rate if i == 0 else change_rates[i - 1]
                days = (change_date - segment_start).days
                if days > 0:
                    segments.append({
                        "start": segment_start.strftime("%Y-%m-%d"),
                        "end": (change_date - timedelta(days=1)).strftime("%Y-%m-%d"),
                        "rate": rate,
                        "days": days
                    })
                segment_start = change_date

        if segment_start <= end_date:
            days = (end_date - segment_start).days + 1
            if days > 0:
                segments.append({
                    "start": segment_start.strftime("%Y-%m-%d"),
                    "end": end_date.strftime("%Y-%m-%d"),
                    "rate": last_rate,
                    "days": days
                })

        return segments

    def calculate_interest(self, params):
        """
        核心利息计算
        params: dict with keys:
            case_no, creditor, debtor, case_reason, id_card, exec_basis,
            due_date, litigation_fee, other_fees, interest_claim,
            claims: list of {principal, rate_type, lpr_multiple, fixed_rate, days_per_year, start_date, end_date}
            payments: list of {amount, date, deduct_order}
        Returns: calc_result dict
        逻辑与原始代码 lines 2770-3102 完全一致
        """
        case_no = params.get("case_no", "")
        creditor = params.get("creditor", "")
        debtor = params.get("debtor", "")
        case_reason = params.get("case_reason", "")
        id_card = params.get("id_card", "")
        exec_basis = params.get("exec_basis", "")
        other_fees = params.get("other_fees", 0)
        litigation_fee = params.get("litigation_fee", 0)
        interest_claim = params.get("interest_claim", 0)
        due_date = params.get("due_date", "")

        # 解析债权
        claims = []
        total_principal = 0

        for i, claim_data in enumerate(params.get("claims", [])):
            principal = parse_money(claim_data.get("principal", 0))
            if principal <= 0:
                continue

            days_per_year = int(claim_data.get("days_per_year", 365))

            claims.append({
                "principal": principal,
                "remaining_principal": principal,
                "rate_type": claim_data.get("rate_type", "一年期LPR分段"),
                "lpr_multiple": parse_money(claim_data.get("lpr_multiple", 100)),
                "fixed_rate": parse_money(claim_data.get("fixed_rate", 0)),
                "days_per_year": days_per_year,
                "start_date": claim_data.get("start_date", ""),
                "end_date": claim_data.get("end_date", ""),
                "general_interest": 0,
                "deducted_interest": 0,
                "interest_segments": [],
            })
            total_principal += principal

        if not claims:
            return None

        # 收集时间节点
        time_points = set()
        for c in claims:
            time_points.add(c["start_date"])
            time_points.add(c["end_date"])
        time_points.add(due_date)
        for p_data in params.get("payments", []):
            pay_date = p_data.get("date", "")
            if parse_money(p_data.get("amount", 0)) > 0:
                time_points.add(pay_date)

        sorted_points = sorted(time_points, key=lambda x: datetime.strptime(x, "%Y-%m-%d"))
        stages = []
        for i in range(len(sorted_points) - 1):
            stages.append({
                "start": sorted_points[i],
                "end": sorted_points[i + 1],
                "payment_at_end": None,
            })

        for p_idx, p_data in enumerate(params.get("payments", [])):
            pay_date = p_data.get("date", "")
            pay_amount = parse_money(p_data.get("amount", 0))
            if pay_amount > 0:
                for stage in stages:
                    if stage["end"] == pay_date:
                        stage["payment_at_end"] = {
                            "idx": p_idx,
                            "amount": pay_amount,
                            "data": p_data,
                        }

        # 统一修正：每个中间节点已在上一段作为结束日计算，下一段应从次日开始，避免日期重复计算
        for i in range(1, len(stages)):
            prev_end = stages[i - 1]["end"]
            next_day = (datetime.strptime(prev_end, "%Y-%m-%d") + timedelta(days=1)).strftime("%Y-%m-%d")
            stages[i]["start"] = next_day

        remaining_litigation = litigation_fee
        remaining_other = other_fees
        remaining_delay = 0
        total_delay = 0          # 累计延迟履行利息
        deducted_delay = 0       # 已抵扣延迟履行利息
        payment_results = []
        delay_segments = []
        stage_records = []

        # 按阶段计算
        for stage_idx, stage in enumerate(stages):
            stage_start = stage["start"]
            stage_end = stage["end"]
            stage_days = days_between(stage_start, stage_end) + 1

            if stage_days <= 0:
                continue

            s_start_dt = datetime.strptime(stage_start, "%Y-%m-%d")
            s_end_dt = datetime.strptime(stage_end, "%Y-%m-%d")

            # 1. 一般债务利息
            stage_claim_interests = []
            for ci, c in enumerate(claims):
                c_start = datetime.strptime(c["start_date"], "%Y-%m-%d")
                c_end = datetime.strptime(c["end_date"], "%Y-%m-%d")
                actual_start = max(c_start, s_start_dt)
                actual_end = min(c_end, s_end_dt)

                if actual_start > actual_end:
                    stage_claim_interests.append({"idx": ci, "interest": 0, "details": []})
                    continue

                actual_start_str = actual_start.strftime("%Y-%m-%d")
                actual_end_str = actual_end.strftime("%Y-%m-%d")

                principal_for_calc = c["remaining_principal"]
                stage_interest = 0
                stage_details = []
                days_per_year = c["days_per_year"]

                if "LPR" in c["rate_type"]:
                    lpr_multiple = c["lpr_multiple"] / 100
                    if lpr_multiple <= 0:
                        lpr_multiple = 1.0
                    lpr_type_key = "five_year" if "五年期" in c["rate_type"] else "one_year"
                    segments = self.get_lpr_segments_optimized(actual_start_str, actual_end_str, lpr_type_key)

                    for seg in segments:
                        rate = seg["rate"] * lpr_multiple / 100
                        interest = principal_for_calc * rate * seg["days"] / days_per_year
                        stage_interest += interest
                        stage_details.append({
                            "period": f"{seg['start']} 至 {seg['end']}",
                            "days": seg["days"],
                            "lpr": seg["rate"],
                            "actual_rate": seg["rate"] * lpr_multiple,
                            "interest": interest,
                            "formula": f"{format_money(principal_for_calc)} × {seg['rate'] * lpr_multiple:.2f}% ÷ {days_per_year} × {seg['days']} = {format_money(interest)}"
                        })
                else:
                    fixed_rate = c["fixed_rate"] / 100
                    actual_days = (actual_end - actual_start).days + 1
                    stage_interest = principal_for_calc * fixed_rate * actual_days / days_per_year
                    stage_details.append({
                        "period": f"{actual_start_str} 至 {actual_end_str}",
                        "days": actual_days,
                        "rate": c["fixed_rate"],
                        "interest": stage_interest,
                        "formula": f"{format_money(principal_for_calc)} × {c['fixed_rate']}% ÷ {days_per_year} × {actual_days} = {format_money(stage_interest)}"
                    })

                c["general_interest"] += stage_interest
                c["interest_segments"].append({
                    "stage_idx": stage_idx,
                    "stage_start": stage_start,
                    "stage_end": stage_end,
                    "period_start": actual_start_str,
                    "period_end": actual_end_str,
                    "days": (actual_end - actual_start).days + 1,
                    "principal_at_start": principal_for_calc,
                    "interest": stage_interest,
                    "details": stage_details,
                })
                stage_claim_interests.append({"idx": ci, "interest": stage_interest, "details": stage_details})

            # 2. 延迟履行利息
            due_dt = datetime.strptime(due_date, "%Y-%m-%d")
            if s_end_dt > due_dt:
                delay_start_dt = max(s_start_dt, due_dt)
                delay_end_dt = s_end_dt
                delay_days = (delay_end_dt - delay_start_dt).days
                # 仅履行期限届满日不计入延迟利息；后续分段的第一天并非届满日，应纳入计算
                if delay_start_dt != due_dt:
                    delay_days += 1
                if delay_days > 0:
                    current_principal_total = sum(cc["remaining_principal"] for cc in claims)
                    delay_base = current_principal_total + remaining_other
                    stage_delay = delay_base * 0.000175 * delay_days
                    remaining_delay += stage_delay
                    total_delay += stage_delay
                    delay_segments.append({
                        "stage_idx": stage_idx,
                        "stage_start": stage_start,
                        "stage_end": stage_end,
                        "period_start": delay_start_dt.strftime("%Y-%m-%d"),
                        "period_end": delay_end_dt.strftime("%Y-%m-%d"),
                        "days": delay_days,
                        "principal_total": current_principal_total,
                        "other_fees": remaining_other,
                        "delay_base": delay_base,
                        "delay_interest": stage_delay,
                        "formula": f"({format_money(current_principal_total)} + {format_money(remaining_other)}) × 0.0175% × {delay_days} = {format_money(stage_delay)}"
                    })
                else:
                    stage_delay = 0
            else:
                stage_delay = 0

            stage_start_state = {
                "stage_idx": stage_idx,
                "period": f"{stage_start} → {stage_end}",
                "days": stage_days,
                "begin_principals": [c["remaining_principal"] for c in claims],
                "begin_other": remaining_other,
                "begin_litigation": remaining_litigation,
                "begin_delay": remaining_delay,
                "interests_added": stage_claim_interests,
                "delay_added": stage_delay,
            }

            # 3. 清偿抵扣
            payment_detail = None
            if stage["payment_at_end"]:
                pmt = stage["payment_at_end"]
                pay_amount = pmt["amount"]
                p_data = pmt["data"]

                deduct_order = p_data.get("deduct_order", [])
                if not deduct_order:
                    deduct_order = ["诉讼费用"]
                    for ci in range(len(claims)):
                        deduct_order.append(f"一般债务利息(债权{ci + 1})")
                    for ci in range(len(claims)):
                        deduct_order.append(f"债权本金(债权{ci + 1})")
                    deduct_order.extend(["其他费用", "延迟履行利息"])

                remaining_payment = pay_amount
                payment_deductions = []

                def extract_claim_index(item_str):
                    match = re.search(r'(\d+)', item_str)
                    if match:
                        idx = int(match.group(1)) - 1
                        if 0 <= idx < len(claims):
                            return idx
                    return None

                for item in deduct_order:
                    if remaining_payment <= 0:
                        break

                    if item == "诉讼费用":
                        deduct = min(remaining_litigation, remaining_payment)
                        if deduct > 0:
                            remaining_litigation -= deduct
                            remaining_payment -= deduct
                            payment_deductions.append({"type": "诉讼费用", "amount": deduct})

                    elif item == "其他费用":
                        deduct = min(remaining_other, remaining_payment)
                        if deduct > 0:
                            remaining_other -= deduct
                            remaining_payment -= deduct
                            payment_deductions.append({"type": "其他费用", "amount": deduct})

                    elif item == "延迟履行利息":
                        deduct = min(remaining_delay, remaining_payment)
                        if deduct > 0:
                            remaining_delay -= deduct
                            deducted_delay += deduct
                            remaining_payment -= deduct
                            payment_deductions.append({"type": "延迟履行利息", "amount": deduct})

                    elif item.startswith("一般债务利息"):
                        ci = extract_claim_index(item)
                        if ci is not None:
                            remaining_interest = claims[ci]["general_interest"] - claims[ci]["deducted_interest"]
                            deduct = min(remaining_interest, remaining_payment)
                            if deduct > 0:
                                claims[ci]["deducted_interest"] += deduct
                                remaining_payment -= deduct
                                payment_deductions.append({"type": item, "amount": deduct})

                    elif item.startswith("债权本金"):
                        ci = extract_claim_index(item)
                        if ci is not None:
                            deduct = min(claims[ci]["remaining_principal"], remaining_payment)
                            if deduct > 0:
                                claims[ci]["remaining_principal"] -= deduct
                                remaining_payment -= deduct
                                payment_deductions.append({"type": item, "amount": deduct})

                payment_detail = {
                    "amount": pay_amount,
                    "date": stage_end,
                    "deductions": payment_deductions,
                    "unused": remaining_payment,
                    "deduct_order": deduct_order,
                }
                payment_results.append(payment_detail)

            stage_end_state = {
                "end_principals": [c["remaining_principal"] for c in claims],
                "end_remaining_interest": [claims[i]["general_interest"] - claims[i]["deducted_interest"] for i in range(len(claims))],
                "end_other": remaining_other,
                "end_litigation": remaining_litigation,
                "end_delay": remaining_delay,
                "payment_detail": payment_detail,
            }
            stage_records.append({
                "stage_info": stage,
                "start_state": stage_start_state,
                "end_state": stage_end_state,
            })

        # 汇总
        total_general = sum(c["general_interest"] for c in claims)
        total_remaining_principal = sum(c["remaining_principal"] for c in claims)
        total_paid_principal = total_principal - total_remaining_principal
        total_deducted_interest = sum(c["deducted_interest"] for c in claims)
        total_remaining_interest = total_general - total_deducted_interest

        total_payments_sum = sum(p["amount"] for p in payment_results) if payment_results else 0
        debt_total = total_principal + total_general + other_fees + litigation_fee + total_delay
        debt_interest_total = total_general + total_delay
        remaining_interest_total = total_remaining_interest + remaining_delay
        remaining_debt_total = debt_total - total_payments_sum

        exec_base = debt_total - litigation_fee
        exec_fee = int(calc_execution_fee(exec_base))
        claimed_total = total_principal + other_fees + litigation_fee + interest_claim

        # 保存计算结果
        self.calc_result = {
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
            "claims": claims,
            "payments": payment_results,
            "delay_segments": delay_segments,
            "stage_records": stage_records,
            "total_principal": total_principal,
            "total_general": total_general,
            "total_remaining_principal": total_remaining_principal,
            "total_remaining_interest": total_remaining_interest,
            "remaining_other": remaining_other,
            "remaining_litigation": remaining_litigation,
            "remaining_delay": remaining_delay,
            "total_delay": total_delay,
            "deducted_delay": deducted_delay,
            "total_paid_principal": total_paid_principal,
            "total_deducted_interest": total_deducted_interest,
            "total_payments_sum": total_payments_sum,
            "debt_total": debt_total,
            "debt_interest_total": debt_interest_total,
            "remaining_interest_total": remaining_interest_total,
            "remaining_debt_total": remaining_debt_total,
            "exec_base": exec_base,
            "exec_fee": exec_fee,
            "claimed_total": claimed_total,
        }

        return self.calc_result


class CalculatorModel:
    """简单计算器模型"""

    def evaluate_expression(self, expr):
        """
        安全地计算数学表达式
        Returns: (result, exec_fee) 或 None（表达式无效时）
        """
        if not expr:
            return None
        try:
            # 替换运算符
            expr = expr.replace("×", "*").replace("÷", "/")
            expr = expr.replace("（", "(").replace("）", ")")
            # 先把中文逗号替换为英文逗号
            expr = expr.replace("，", ",")
            # 去除所有逗号（包括千位分隔符），再去掉空格
            expr = expr.replace(",", "").replace(" ", "")
            if not re.match(r'^[0-9\+\-\*\/\(\)\.]+$', expr):
                return None
            result = eval(expr)
            return result
        except Exception:
            return None

    def calc_execution_fee(self, amount):
        """委托给utils.calc_execution_fee计算执行费"""
        return calc_execution_fee(amount)
