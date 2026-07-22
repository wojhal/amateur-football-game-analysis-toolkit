import glob
import os
import subprocess
import sys

# Automatically run pip install when the script runs (for local setups)
try:
    subprocess.check_call(
        [sys.executable, "-m", "pip", "install", "-r", "requirements.txt"]
    )
except Exception:
    pass  # Ignored if requirements.txt doesn't exist or is already handled by cloud

from math import pi
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import streamlit as st

# 1. App Configuration & Page Layout
st.set_page_config(
    page_title="Football Player Scouting Radar", page_icon="⚽", layout="wide"
)

st.title("⚽ Head-to-Head Player Scouting Radar")
st.markdown(
    "Select a match from the directory, choose two players from the expandable lists, and compare their performance profile across key metrics."
)

# 2. Automatically Find All CSV Files in the Current Directory
st.sidebar.header("📁 Match Data Selection")

current_dir = os.path.dirname(os.path.abspath(__file__))
csv_files = glob.glob(os.path.join(current_dir, "*.csv"))

if not csv_files:
    csv_files = glob.glob("*.csv")

if not csv_files:
    st.error("⚠️ No `.csv` files were found in the directory alongside `app.py`. Please place your CSV match files into the folder and refresh the page!")
    st.stop()

file_dict = {os.path.basename(f): f for f in csv_files}

selected_filename = st.sidebar.selectbox(
    "Select Match CSV File:",
    options=sorted(list(file_dict.keys())),
    help="Automatically detects all CSV files stored in the same folder as app.py"
)

# --- Define Outfield Metric Sets ---
OUTFIELD_COLS = [
    "Passes (succ)", "Key", "Prog. (succ)", "Shots", "Grd duels (succ)",
    "Dribbles (succ)", "Tackles (succ)", "Int", "Clr", "Trn", "Fouls", "Fouled"
]
OUTFIELD_CATEGORIES = [
    "Total Passes", "Key Passes", "Prog. Passes", "Shots", "Ground Duels",
    "Dribbles", "Tackles", "Interceptions", "Clearances", "Turnovers", "Fouls", "Fouled"
]

# --- Define Goalkeeper Metric Sets ---
GK_COLS = [
    "Passes (succ)", "Prog. (succ)", "Long (succ)", "Int", "Clr", "Saves", "Blk", "Trn"
]
GK_CATEGORIES = [
    "Total Passes", "Prog. Passes", "Long Passes", "Interceptions", "Clearances", "Saves", "Blocks", "Turnovers"
]

# Combined tracking to verify columns exist
ALL_REQUIRED_COLS = list(set(OUTFIELD_COLS + GK_COLS))

# 3. Read and Clean Selected Data
try:
    df = pd.read_csv(file_dict[selected_filename], sep=None, engine="python")
except Exception as e:
    st.error(f"Error reading `{selected_filename}`: {e}")
    st.stop()

if "Player" in df.columns:
    df = df[df["Player"] != "Team total"].copy()

missing_cols = [col for col in ALL_REQUIRED_COLS if col not in df.columns]
if missing_cols:
    st.error(
        f"The selected CSV (`{selected_filename}`) is missing these required columns: **{', '.join(missing_cols)}**"
    )
    st.stop()

for req_col in ["Player", "Team", "Position"]:
    if req_col not in df.columns:
        df[req_col] = "Unknown"

# --- ADD FANTOM BENCHMARK PLAYER ---
fantom_row = {
    "Player": "Fantom",
    "Team": "Benchmark",
    "Position": np.nan
}
for col in ALL_REQUIRED_COLS:
    fantom_row[col] = 0.0

df = pd.concat([df, pd.DataFrame([fantom_row])], ignore_index=True)

# 4. Create Display Label & Dynamic Positional Ranking
df["Display_Label"] = (
    df["Player"].astype(str)
    + " ("
    + df["Team"].astype(str)
    + ") - "
    + df["Position"].fillna("N/A").astype(str)
)

# Convert metric columns to numeric safely
for col in ALL_REQUIRED_COLS:
    df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)

# Apply min-max normalization independently for GKs and Outfielders
df["Is_GK"] = df["Position"] == "GK"
for col in ALL_REQUIRED_COLS:
    df[col + "_norm"] = 50.0  # Fallback baseline
    
    for is_gk_group in [True, False]:
        mask = df["Is_GK"] == is_gk_group
        if mask.any():
            sub_df = df[mask]
            min_val = sub_df[col].min()
            max_val = sub_df[col].max()
            if max_val != min_val:
                df.loc[mask, col + "_norm"] = ((df.loc[mask, col] - min_val) / (max_val - min_val)) * 100

# Tactical position sequence ordering
position_order = ["GK", "RB", "CB", "LB", "RW", "LW", "CM", "CAM", "ST"]
pos_map = {pos: i for i, pos in enumerate(position_order)}
df["Pos_Rank"] = df["Position"].map(lambda x: pos_map.get(x, 99))
df = df.sort_values(by=["Pos_Rank", "Player"])

# 5. Sidebar Player Selection (DYNAMIC ANCHOR STATE MACHINE)
st.sidebar.markdown("---")
st.sidebar.header("🔍 Select Players to Compare")

placeholder = "-- Select a Player --"
all_player_labels = df["Display_Label"].tolist()

def get_safe_index(options_list, session_key):
    current_val = st.session_state.get(session_key, placeholder)
    if current_val in options_list:
        return options_list.index(current_val)
    return 0

# --- PRE-FLIGHT ANCHOR & COMPATIBILITY SYNC ---
p1_curr = st.session_state.get("player1_select", placeholder)
p2_curr = st.session_state.get("player2_select", placeholder)
anchor = st.session_state.get("anchor_box", None)

# Determine who is the primary "anchor" (the box most recently picked from neutral)
if p1_curr == placeholder and p2_curr == placeholder:
    anchor = None
elif p1_curr != placeholder and p2_curr == placeholder:
    anchor = "p1"
elif p1_curr == placeholder and p2_curr != placeholder:
    anchor = "p2"
elif p1_curr != placeholder and p2_curr != placeholder:
    if anchor not in ["p1", "p2"]:
        anchor = "p1"  # Default fallback if both appeared simultaneously
    
    # Check if the anchor's role clashed with the non-anchor's role
    p1_is_gk = df[df["Display_Label"] == p1_curr].iloc[0]["Is_GK"]
    p2_is_gk = df[df["Display_Label"] == p2_curr].iloc[0]["Is_GK"]
    
    if p1_is_gk != p2_is_gk:
        # A role clash occurred! The anchor dictates the rules, so reset the NON-anchor!
        if anchor == "p1":
            st.session_state["player2_select"] = placeholder
            p2_curr = placeholder
        else:
            st.session_state["player1_select"] = placeholder
            p1_curr = placeholder

st.session_state["anchor_box"] = anchor

# --- BUILD OPTION LISTS BASED ON ANCHOR ---
if anchor == "p2":
    # Player 2 is the anchor -> P2 gets FULL squad list, P1 is restricted to match P2's role
    p2_options = [placeholder] + [p for p in all_player_labels if p != p1_curr]
    
    p2_is_gk = df[df["Display_Label"] == p2_curr].iloc[0]["Is_GK"]
    p1_options = [placeholder] + df[(df["Is_GK"] == p2_is_gk) & (df["Display_Label"] != p2_curr)]["Display_Label"].tolist()
else:
    # Player 1 is the anchor (or both are neutral) -> P1 gets FULL squad list, P2 is restricted
    p1_options = [placeholder] + [p for p in all_player_labels if p != p2_curr]
    
    if p1_curr != placeholder:
        p1_is_gk = df[df["Display_Label"] == p1_curr].iloc[0]["Is_GK"]
        p2_options = [placeholder] + df[(df["Is_GK"] == p1_is_gk) & (df["Display_Label"] != p1_curr)]["Display_Label"].tolist()
    else:
        p2_options = [placeholder] + all_player_labels

# Safety fallbacks if state drifted
if p1_curr not in p1_options:
    st.session_state["player1_select"] = placeholder
    p1_curr = placeholder
if p2_curr not in p2_options:
    st.session_state["player2_select"] = placeholder
    p2_curr = placeholder

# --- RENDER WIDGETS ---
player1_label = st.sidebar.selectbox(
    "Select Player 1 (Blue)",
    options=p1_options,
    index=get_safe_index(p1_options, "player1_select"),
    key="player1_select",
    help="Sorted by Position: GK -> RB -> CB -> LB -> RW -> LW -> CM -> CAM -> ST",
)

player2_label = st.sidebar.selectbox(
    "Select Player 2 (Orange)",
    options=p2_options,
    index=get_safe_index(p2_options, "player2_select"),
    key="player2_select",
    help="Filters dynamically to align with the primary pick (Anchor)",
)

st.markdown("---")

# Check if user has selected two valid, distinct players before showing graphs
if player1_label == placeholder or player2_label == placeholder:
    st.info("👈 **Please select two players from the sidebar on the left to generate the scouting comparison.**")
else:
    # Extract structural player profile rows
    p1_row = df[df["Display_Label"] == player1_label].iloc[0]
    p2_row = df[df["Display_Label"] == player2_label].iloc[0]

    p1_name = p1_row["Player"]
    p2_name = p2_row["Player"]

    # Determine runtime context configuration (GK vs Outfield setting)
    if p1_row["Is_GK"] and p2_row["Is_GK"]:
        active_cols = GK_COLS
        active_categories = GK_CATEGORIES
        comparison_title = "🧤 Goalkeeper Profile Comparison"
    else:
        active_cols = OUTFIELD_COLS
        active_categories = OUTFIELD_CATEGORIES
        comparison_title = "🏃 Outfield Profile Comparison"

    # 6. Build the Visuals Layout: Stats Table (Left) + Radar Chart (Right)
    col1, col2 = st.columns([1, 1.2])

    with col1:
        st.subheader(f"📊 Raw Stats: {comparison_title}")
        st.write("Color Key: **:green[Green]** = Higher | **:red[Red]** = Lower")

        table_data = []
        for cat_name, col_name in zip(active_categories, active_cols):
            val1 = p1_row[col_name]
            val2 = p2_row[col_name]

            val1_fmt = int(val1) if val1.is_integer() else round(val1, 2)
            val2_fmt = int(val2) if val2.is_integer() else round(val2, 2)

            if val1 > val2:
                v1_str = f":green[**{val1_fmt}**]"
                v2_str = f":red[{val2_fmt}]"
            elif val1 < val2:
                v1_str = f":red[{val1_fmt}]"
                v2_str = f":green[**{val2_fmt}**]"
            else:
                v1_str = f"**{val1_fmt}**"
                v2_str = f"**{val2_fmt}**"

            table_data.append(
                {
                    f"🔵 {p1_name} ({p1_row['Position']})": v1_str,
                    "Metric": f"**{cat_name}**",
                    f"🟠 {p2_name} ({p2_row['Position']})": v2_str,
                }
            )

        st.markdown(
            pd.DataFrame(table_data).to_markdown(index=False),
            unsafe_allow_html=True,
        )

    with col2:
        st.subheader("🕸️ Head-to-Head Spider Plot")

        N = len(active_categories)
        angles = [n / float(N) * 2 * pi for n in range(N)]
        angles += angles[:1]

        values1 = [p1_row[col + "_norm"] for col in active_cols]
        values1 += values1[:1]

        values2 = [p2_row[col + "_norm"] for col in active_cols]
        values2 += values2[:1]

        fig, ax = plt.subplots(figsize=(8, 8), subplot_kw=dict(polar=True))
        ax.set_theta_offset(pi / 2)
        ax.set_theta_direction(-1)

        plt.xticks(
            angles[:-1], active_categories, color="black", size=10, fontweight="bold"
        )
        ax.set_rlabel_position(0)
        plt.yticks(
            [20, 40, 60, 80, 100],
            ["20%", "40%", "60%", "80%", "100%"],
            color="grey",
            size=8,
        )
        plt.ylim(0, 100)

        # Plot Player 1 (Blue)
        ax.plot(
            angles,
            values1,
            linewidth=2.5,
            linestyle="solid",
            label=f"{p1_name} ({p1_row['Team']} - {p1_row['Position']})",
            color="#1f77b4",
        )
        ax.fill(angles, values1, "#1f77b4", alpha=0.25)

        # Plot Player 2 (Orange)
        ax.plot(
            angles,
            values2,
            linewidth=2.5,
            linestyle="solid",
            label=f"{p2_name} ({p2_row['Team']} - {p2_row['Position']})",
            color="#ff7f0e",
        )
        ax.fill(angles, values2, "#ff7f0e", alpha=0.25)

        plt.legend(loc="upper right", bbox_to_anchor=(1.3, 1.15), fontsize=10)
        plt.tight_layout()

        st.pyplot(fig)