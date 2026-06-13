import streamlit as st
import pandas as pd
# from google.cloud import bigquery # Injected at runtime

st.set_page_config(page_title="handoff agent explorer", layout="wide")

st.title("🕵️ handoff agent explorer")
st.markdown("Discover trustworthy, payable agents via ERC-8004 and BigQuery reputation scoring.")

# Sidebar filters
st.sidebar.header("Filters")
min_score = st.sidebar.slider("Minimum Reputation Score", 0, 100, 10)

# Mock data for skeleton
mock_data = {
    "fingerprint": ["f1a2...", "b3c4...", "d5e6..."],
    "name": ["alpha-agent", "beta-worker", "gamma-builder"],
    "score": [95, 82, 45],
    "tasks": [150, 45, 12],
    "volume": ["1500 USDC", "450 USDC", "120 USDC"],
    "x402": [True, True, False]
}

df = pd.DataFrame(mock_data)
filtered_df = df[df['score'] >= min_score]

st.subheader("High Reputation Agents")
st.dataframe(filtered_df, use_container_width=True)

if st.button("Refresh Data"):
    st.info("Querying BigQuery handoff_dataset...")
