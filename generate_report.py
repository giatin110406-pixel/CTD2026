import os
import glob
import json
import pandas as pd
from jinja2 import Template

def main():
    # Find all ragas result files
    csv_files = glob.glob("ragas_results_*.csv")
    if not csv_files:
        print("No ragas_results_*.csv files found in the current directory!")
        return

    print(f"Found {len(csv_files)} result files:")
    for f in csv_files:
        print(f" - {f}")

    # Map model name from filename
    def get_model_display_name(filename):
        name = filename.replace("ragas_results_", "").replace(".csv", "")
        # Beautify names
        mapping = {
            "claude_sonnet_5_official_api": "Sonnet 5",
            "deepseek-v4_pro_official_api": "DeepSeek V4 Pro",
            "gemma_4_31b_google_ai_studio": "Gemini 4 31B",
            "gpt-4.1_mini_github": "GPT 4.1 Mini",
            "llama_3.3_70b_groq": "Llama 3.3 70B",
            "qwen_3_groq": "Qwen 3",
            "zai_glm_cerebras": "Zai GLM"
        }
        return mapping.get(name, name.replace("_", " ").title())

    # Load all dataframes
    model_data = {}
    all_questions = []

    for f in csv_files:
        model_name = get_model_display_name(f)
        try:
            df = pd.read_csv(f)
            # Ensure required columns exist
            for col in ['user_input', 'response', 'reference', 'retrieved_contexts']:
                if col not in df.columns:
                    df[col] = ""
            # Fill NaN
            df = df.fillna({
                'faithfulness': 0.0,
                'answer_relevancy': 0.0,
                'context_precision': 0.0,
                'answer_correctness': 0.0,
                'response': "",
                'reference': "",
                'retrieved_contexts': "[]"
            })
            model_data[model_name] = df
            
            # Gather questions from the first valid file
            if not all_questions:
                all_questions = df['user_input'].tolist()
        except Exception as e:
            print(f"Lỗi khi đọc file {f}: {e}")

    if not all_questions:
        print("Không có câu hỏi nào để so sánh.")
        return

    # Prepare data structure for the interactive report
    questions_list = []
    for idx, q in enumerate(all_questions):
        q_data = {
            "id": idx + 1,
            "question": q,
            "reference": "",
            "contexts": [],
            "models": {}
        }
        
        # Get reference and contexts (usually same across models, we take first model that has them)
        for model_name, df in model_data.items():
            if idx < len(df):
                row = df.iloc[idx]
                if not q_data["reference"] and row["reference"]:
                    q_data["reference"] = row["reference"]
                
                if not q_data["contexts"] and row["retrieved_contexts"]:
                    # Safely parse string representation of list
                    raw_context = row["retrieved_contexts"]
                    if isinstance(raw_context, str):
                        try:
                            # Evaluate string list or handle custom format
                            if raw_context.startswith("[") and raw_context.endswith("]"):
                                import ast
                                q_data["contexts"] = ast.literal_eval(raw_context)
                            else:
                                q_data["contexts"] = [raw_context]
                        except Exception:
                            q_data["contexts"] = [raw_context]
                    elif isinstance(raw_context, list):
                        q_data["contexts"] = raw_context
                    else:
                        q_data["contexts"] = [str(raw_context)]
                
                # Model scores and response
                q_data["models"][model_name] = {
                    "response": row["response"],
                    "scores": {
                        "faithfulness": round(float(row.get("faithfulness", 0.0)), 3),
                        "answer_relevancy": round(float(row.get("answer_relevancy", 0.0)), 3),
                        "context_precision": round(float(row.get("context_precision", 0.0)), 3),
                        "answer_correctness": round(float(row.get("answer_correctness", 0.0)), 3)
                    }
                }
        
        # Clean up empty list or string values
        if not q_data["contexts"]:
            q_data["contexts"] = ["Không tìm thấy ngữ cảnh được truy xuất."]
        
        questions_list.append(q_data)

    # Compute overall metrics summary for the header
    summary_data = []
    # If ragas_judges_comparison.csv exists, load it directly for official averages
    if os.path.exists("ragas_judges_comparison.csv"):
        try:
            summary_df = pd.read_csv("ragas_judges_comparison.csv")
            name_mapping = {
                "GPT-4.1 Mini (GitHub)": "GPT 4.1 Mini",
                "Qwen 3 (Groq)": "Qwen 3",
                "Llama 3.3 70B (Groq)": "Llama 3.3 70B",
                "Zai GLM (Cerebras)": "Zai GLM",
                "Gemma 4 31B (Google AI Studio)": "Gemini 4 31B",
                "DeepSeek-V4 Pro (Official API)": "DeepSeek V4 Pro",
                "Claude Sonnet 5 (Official API)": "Sonnet 5"
            }
            for _, row in summary_df.iterrows():
                original_name = row["Judge Model"]
                summary_data.append({
                    "model": name_mapping.get(original_name, original_name),
                    "faithfulness": row.get("faithfulness", 0.0),
                    "answer_relevancy": row.get("answer_relevancy", 0.0),
                    "context_precision": row.get("context_precision", 0.0),
                    "answer_correctness": row.get("answer_correctness", 0.0)
                })
        except Exception:
            pass

    # If summary is empty, calculate it manually from the loaded data
    if not summary_data:
        for model_name, df in model_data.items():
            summary_data.append({
                "model": model_name,
                "faithfulness": round(df["faithfulness"].mean(), 3),
                "answer_relevancy": round(df["answer_relevancy"].mean(), 3),
                "context_precision": round(df["context_precision"].mean(), 3),
                "answer_correctness": round(df["answer_correctness"].mean(), 3)
            })

    # Render HTML template
    html_template = """<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Báo Cáo So Sánh Các Mô Hình RAG</title>
    <!-- Google Fonts -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg-primary: #0b0f19;
            --bg-secondary: #161b26;
            --bg-tertiary: #1f2638;
            --text-primary: #f3f4f6;
            --text-secondary: #9ca3af;
            --accent-primary: #6366f1;
            --accent-secondary: #4f46e5;
            --success: #10b981;
            --warning: #f59e0b;
            --error: #ef4444;
            --border-color: rgba(255, 255, 255, 0.08);
            --card-shadow: 0 8px 30px rgb(0 0 0 / 50%);
        }

        [data-theme="light"] {
            --bg-primary: #f8fafc;
            --bg-secondary: #ffffff;
            --bg-tertiary: #f1f5f9;
            --text-primary: #0f172a;
            --text-secondary: #475569;
            --accent-primary: #3b82f6;
            --accent-secondary: #2563eb;
            --border-color: rgba(0, 0, 0, 0.08);
            --card-shadow: 0 8px 30px rgba(0, 0, 0, 0.05);
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            font-family: 'Plus Jakarta Sans', sans-serif;
            background-color: var(--bg-primary);
            color: var(--text-primary);
            transition: background-color 0.3s ease, color 0.3s ease;
            height: 100vh;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }

        /* Header */
        header {
            background-color: var(--bg-secondary);
            border-bottom: 1px solid var(--border-color);
            padding: 1.2rem 2rem;
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-shrink: 0;
            z-index: 10;
        }

        .header-title h1 {
            font-size: 1.4rem;
            font-weight: 800;
            background: linear-gradient(135deg, var(--accent-primary) 0%, #a78bfa 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }

        .header-title p {
            font-size: 0.85rem;
            color: var(--text-secondary);
            margin-top: 0.2rem;
        }

        .header-controls {
            display: flex;
            align-items: center;
            gap: 1rem;
        }

        .btn-theme {
            background: var(--bg-tertiary);
            border: 1px solid var(--border-color);
            color: var(--text-primary);
            padding: 0.5rem 1rem;
            border-radius: 8px;
            cursor: pointer;
            font-weight: 600;
            font-size: 0.85rem;
            display: flex;
            align-items: center;
            gap: 0.5rem;
            transition: all 0.2s ease;
        }

        .btn-theme:hover {
            border-color: var(--accent-primary);
            background: rgba(99, 102, 241, 0.1);
        }

        /* Container Layout */
        .main-container {
            display: flex;
            flex: 1;
            overflow: hidden;
        }

        /* Sidebar: List of questions */
        .sidebar {
            width: 320px;
            background-color: var(--bg-secondary);
            border-right: 1px solid var(--border-color);
            display: flex;
            flex-direction: column;
            flex-shrink: 0;
        }

        .sidebar-header {
            padding: 1rem;
            border-bottom: 1px solid var(--border-color);
        }

        .sidebar-header h2 {
            font-size: 1rem;
            font-weight: 700;
            color: var(--text-primary);
        }

        .question-list {
            list-style: none;
            overflow-y: auto;
            flex: 1;
            padding: 0.5rem;
        }

        .question-item {
            padding: 0.9rem 1rem;
            border-radius: 8px;
            margin-bottom: 0.4rem;
            cursor: pointer;
            transition: all 0.2s ease;
            font-size: 0.85rem;
            line-height: 1.4;
            color: var(--text-secondary);
            border: 1px solid transparent;
            display: flex;
            gap: 0.6rem;
        }

        .question-item span.number {
            font-weight: 700;
            color: var(--accent-primary);
            min-width: 18px;
        }

        .question-item:hover {
            background-color: var(--bg-tertiary);
            color: var(--text-primary);
        }

        .question-item.active {
            background-color: rgba(99, 102, 241, 0.12);
            color: var(--text-primary);
            border-color: rgba(99, 102, 241, 0.3);
            font-weight: 500;
        }

        /* Content Area */
        .content-area {
            flex: 1;
            display: flex;
            flex-direction: column;
            overflow-y: auto;
            background-color: var(--bg-primary);
            padding: 1.5rem 2rem;
            gap: 1.5rem;
        }

        .card {
            background-color: var(--bg-secondary);
            border: 1px solid var(--border-color);
            border-radius: 12px;
            padding: 1.5rem;
            box-shadow: var(--card-shadow);
        }

        .card-title {
            font-size: 1.05rem;
            font-weight: 700;
            margin-bottom: 1rem;
            display: flex;
            align-items: center;
            gap: 0.5rem;
            color: var(--text-primary);
            border-left: 4px solid var(--accent-primary);
            padding-left: 0.6rem;
        }

        .question-display {
            font-size: 1.15rem;
            font-weight: 600;
            line-height: 1.5;
            margin-bottom: 1rem;
            color: var(--text-primary);
        }

        .reference-display {
            background-color: rgba(16, 185, 129, 0.08);
            border: 1px dashed rgba(10, 185, 129, 0.3);
            border-radius: 8px;
            padding: 1rem;
            font-size: 0.9rem;
            line-height: 1.6;
        }

        .reference-display h4 {
            color: var(--success);
            font-size: 0.8rem;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            margin-bottom: 0.4rem;
            font-weight: 700;
        }

        /* Contexts Section */
        .contexts-container {
            display: flex;
            flex-direction: column;
            gap: 0.8rem;
            max-height: 300px;
            overflow-y: auto;
            padding-right: 0.5rem;
        }

        .context-box {
            background-color: var(--bg-tertiary);
            border-radius: 8px;
            padding: 0.8rem 1rem;
            font-size: 0.85rem;
            line-height: 1.6;
            border-left: 3px solid var(--text-secondary);
            white-space: pre-line;
        }

        /* Summary Dashboard */
        .summary-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 1rem;
            margin-bottom: 1.5rem;
        }

        .summary-card {
            background-color: var(--bg-secondary);
            border: 1px solid var(--border-color);
            border-radius: 12px;
            padding: 1rem;
            box-shadow: var(--card-shadow);
        }

        .summary-card h3 {
            font-size: 0.9rem;
            font-weight: 700;
            margin-bottom: 0.8rem;
            color: var(--accent-primary);
        }

        .summary-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 0.8rem;
        }

        .summary-table th, .summary-table td {
            text-align: left;
            padding: 0.4rem 0.5rem;
            border-bottom: 1px solid var(--border-color);
        }

        .summary-table th {
            color: var(--text-secondary);
            font-weight: 600;
        }

        /* Model comparison view */
        .models-tabs {
            display: flex;
            border-bottom: 1px solid var(--border-color);
            gap: 0.5rem;
            overflow-x: auto;
            padding-bottom: 1px;
        }

        .tab-btn {
            background: none;
            border: none;
            color: var(--text-secondary);
            padding: 0.75rem 1.2rem;
            cursor: pointer;
            font-size: 0.85rem;
            font-weight: 600;
            border-bottom: 3px solid transparent;
            white-space: nowrap;
            transition: all 0.2s ease;
        }

        .tab-btn:hover {
            color: var(--text-primary);
            background-color: var(--bg-tertiary);
            border-radius: 8px 8px 0 0;
        }

        .tab-btn.active {
            color: var(--accent-primary);
            border-bottom-color: var(--accent-primary);
            font-weight: 700;
        }

        .model-content {
            display: none;
            padding-top: 1.5rem;
            animation: fadeIn 0.3s ease;
        }

        .model-content.active {
            display: block;
        }

        .scores-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 1rem;
            margin-bottom: 1.5rem;
        }

        @media (max-width: 768px) {
            .scores-grid {
                grid-template-columns: repeat(2, 1fr);
            }
        }

        .score-card {
            background-color: var(--bg-tertiary);
            border-radius: 8px;
            padding: 0.8rem;
            text-align: center;
            border: 1px solid var(--border-color);
        }

        .score-val {
            font-size: 1.5rem;
            font-weight: 800;
            color: var(--accent-primary);
            margin-top: 0.2rem;
        }

        .score-label {
            font-size: 0.75rem;
            color: var(--text-secondary);
            text-transform: uppercase;
            letter-spacing: 0.05em;
            font-weight: 600;
        }

        .response-box {
            background-color: var(--bg-tertiary);
            border-radius: 8px;
            padding: 1.2rem;
            font-size: 0.95rem;
            line-height: 1.7;
            white-space: pre-line;
            border-left: 4px solid var(--accent-primary);
        }

        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(5px); }
            to { opacity: 1; transform: translateY(0); }
        }

        /* Quality indicator colors */
        .val-high { color: var(--success) !important; }
        .val-med { color: var(--warning) !important; }
        .val-low { color: var(--error) !important; }
    </style>
</head>
<body>

    <header>
        <div class="header-title">
            <h1>📊 Báo Cáo Đánh Giá & So Sánh RAG</h1>
            <p>Phân tích câu trả lời của các Model trên tập dữ liệu Golden Dataset (21 câu hỏi)</p>
        </div>
        <div class="header-controls">
            <button class="btn-theme" onclick="toggleTheme()">
                <span id="theme-icon">☀️</span> <span id="theme-text">Giao diện Sáng</span>
            </button>
        </div>
    </header>

    <div class="main-container">
        <!-- Sidebar -->
        <div class="sidebar">
            <div class="sidebar-header">
                <h2>Danh sách Câu hỏi</h2>
            </div>
            <ul class="question-list" id="question-list">
                <!-- Dynamically populated -->
            </ul>
        </div>

        <!-- Content Area -->
        <div class="content-area">
            <!-- Summary Dashboard -->
            <div class="card">
                <div class="card-title">📈 Điểm số trung bình (Ragas Metrics Comparison)</div>
                <table class="summary-table" style="font-size: 0.9rem; text-align: center;">
                    <thead>
                        <tr>
                            <th style="text-align: left;">Mô hình (Model Judge)</th>
                            <th>Faithfulness (Độ trung thực)</th>
                            <th>Answer Relevancy (Độ liên quan)</th>
                            <th>Context Precision (Độ chuẩn xác ngữ cảnh)</th>
                            <th>Answer Correctness (Độ chính xác đáp án)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {% for item in summary_data %}
                        <tr>
                            <td style="text-align: left; font-weight: 600;">{{ item.model }}</td>
                            <td class="score-cell">{{ item.faithfulness }}</td>
                            <td class="score-cell">{{ item.answer_relevancy }}</td>
                            <td class="score-cell">{{ item.context_precision }}</td>
                            <td class="score-cell">{{ item.answer_correctness }}</td>
                        </tr>
                        {% endfor %}
                    </tbody>
                </table>
            </div>

            <!-- Active Question Details -->
            <div class="card">
                <div class="card-title">❓ Câu hỏi & Đáp án gốc</div>
                <div class="question-display" id="active-question">Chọn một câu hỏi ở danh sách bên trái để bắt đầu xem chi tiết...</div>
                <div class="reference-display">
                    <h4>Ground Truth (Đáp án đúng chuẩn)</h4>
                    <div id="active-reference">-</div>
                </div>
            </div>

            <!-- Retrieved Contexts -->
            <div class="card">
                <div class="card-title">📖 Ngữ cảnh đã truy xuất (Retrieved Contexts)</div>
                <div class="contexts-container" id="active-contexts">
                    <!-- Contexts will be loaded here -->
                </div>
            </div>

            <!-- Model Comparison -->
            <div class="card">
                <div class="card-title">🤖 So sánh phản hồi của các Model</div>
                <div class="models-tabs" id="model-tabs-container">
                    <!-- Tab buttons dynamically populated -->
                </div>
                <div id="model-contents-container">
                    <!-- Model details dynamically populated -->
                </div>
            </div>
        </div>
    </div>

    <script>
        // Data injected from Python
        const questionsData = {{ questions_json }};

        let currentQuestionIndex = 0;
        let currentModelTab = "";

        // Render question list in sidebar
        const qListContainer = document.getElementById("question-list");
        questionsData.forEach((q, idx) => {
            const li = document.createElement("li");
            li.className = `question-item ${idx === 0 ? 'active' : ''}`;
            li.onclick = () => selectQuestion(idx);
            
            // Limit question text in sidebar
            let shortText = q.question.substring(0, 75);
            if (q.question.length > 75) shortText += "...";
            
            li.innerHTML = `<span class="number">#${q.id}</span> <div>${shortText}</div>`;
            qListContainer.appendChild(li);
        });

        // Format cell values
        document.querySelectorAll('.score-cell').forEach(cell => {
            const val = parseFloat(cell.innerText);
            if (!isNaN(val)) {
                if (val >= 0.85) cell.classList.add('val-high');
                else if (val >= 0.6) cell.classList.add('val-med');
                else cell.classList.add('val-low');
            }
        });

        function getScoreClass(val) {
            if (val >= 0.85) return 'val-high';
            if (val >= 0.6) return 'val-med';
            return 'val-low';
        }

        // Handle question selection
        function selectQuestion(idx) {
            currentQuestionIndex = idx;
            
            // Update active sidebar item
            const items = document.querySelectorAll(".question-item");
            items.forEach((item, i) => {
                if (i === idx) item.classList.add("active");
                else item.classList.remove("active");
            });

            const qData = questionsData[idx];

            // Render question details
            document.getElementById("active-question").innerText = qData.question;
            document.getElementById("active-reference").innerText = qData.reference || "Không có đáp án tham chiếu.";

            // Render contexts
            const contextsContainer = document.getElementById("active-contexts");
            contextsContainer.innerHTML = "";
            qData.contexts.forEach((ctx, cIdx) => {
                const box = document.createElement("div");
                box.className = "context-box";
                box.innerHTML = `<strong>Đoạn trích ${cIdx + 1}:</strong><br>${ctx}`;
                contextsContainer.appendChild(box);
            });

            // Render model tabs and content
            const tabsContainer = document.getElementById("model-tabs-container");
            const contentsContainer = document.getElementById("model-contents-container");
            
            tabsContainer.innerHTML = "";
            contentsContainer.innerHTML = "";

            const models = Object.keys(qData.models);
            if (models.length > 0) {
                if (!currentModelTab || !models.includes(currentModelTab)) {
                    currentModelTab = models[0];
                }

                models.forEach(modelName => {
                    const btn = document.createElement("button");
                    btn.className = `tab-btn ${modelName === currentModelTab ? 'active' : ''}`;
                    btn.onclick = () => selectModelTab(modelName);
                    btn.innerText = modelName;
                    tabsContainer.appendChild(btn);

                    // Content
                    const mInfo = qData.models[modelName];
                    const contentDiv = document.createElement("div");
                    contentDiv.className = `model-content ${modelName === currentModelTab ? 'active' : ''}`;
                    contentDiv.id = `content-${modelName.replace(/\s+/g, '-')}`;

                    let scoresHtml = "";
                    Object.entries(mInfo.scores).forEach(([sName, sVal]) => {
                        const displayName = sName.replace("_", " ");
                        scoresHtml += `
                            <div class="score-card">
                                <div class="score-label">${displayName}</div>
                                <div class="score-val ${getScoreClass(sVal)}">${sVal}</div>
                            </div>
                        `;
                    });

                    contentDiv.innerHTML = `
                        <div class="scores-grid">
                            ${scoresHtml}
                        </div>
                        <div class="response-box">
                            ${mInfo.response || 'Model không tạo phản hồi hoặc gặp lỗi.'}
                        </div>
                    `;
                    contentsContainer.appendChild(contentDiv);
                });
            }
        }

        // Switch tabs
        function selectModelTab(modelName) {
            currentModelTab = modelName;
            const tabs = document.querySelectorAll(".tab-btn");
            tabs.forEach(tab => {
                if (tab.innerText === modelName) tab.classList.add("active");
                else tab.classList.remove("active");
            });

            const contents = document.querySelectorAll(".model-content");
            contents.forEach(content => {
                content.classList.remove("active");
            });

            const activeContent = document.getElementById(`content-${modelName.replace(/\s+/g, '-')}`);
            if (activeContent) activeContent.classList.add("active");
        }

        // Toggle Theme
        function toggleTheme() {
            const body = document.body;
            const currentTheme = body.getAttribute("data-theme");
            const newTheme = currentTheme === "light" ? "dark" : "light";
            body.setAttribute("data-theme", newTheme);
            
            const btnIcon = document.getElementById("theme-icon");
            const btnText = document.getElementById("theme-text");
            if (newTheme === "light") {
                btnIcon.innerText = "🌙";
                btnText.innerText = "Giao diện Tối";
            } else {
                btnIcon.innerText = "☀️";
                btnText.innerText = "Giao diện Sáng";
            }
        }

        // Initialize first question
        if (questionsData.length > 0) {
            selectQuestion(0);
        }
    </script>
</body>
</html>
"""
    
    # Parse questions data to JSON string for javascript insertion
    questions_json = json.dumps(questions_list, ensure_ascii=False)
    
    # Compile template using jinja2 or simple replace
    template = Template(html_template)
    rendered_html = template.render(
        summary_data=summary_data,
        questions_json=questions_json
    )
    
    output_filename = "comparison_report.html"
    with open(output_filename, "w", encoding="utf-8") as f:
        f.write(rendered_html)
        
    print(f"\nSuccessfully generated report at: {os.path.abspath(output_filename)}")
    print("Double-click this file to open it in your browser!")

if __name__ == "__main__":
    main()
