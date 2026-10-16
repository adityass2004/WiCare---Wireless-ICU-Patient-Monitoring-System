import os
import pandas as pd
import matplotlib.pyplot as plt
import numpy as np

def generate():
    csv_path = os.path.join(os.path.dirname(__file__), '..', 'docs', 'data', 'experiment_results.csv')
    img_dir = os.path.join(os.path.dirname(__file__), '..', 'docs', 'images')
    os.makedirs(img_dir, exist_ok=True)

    if not os.path.exists(csv_path):
        print(f"CSV path {csv_path} not found.")
        return

    df = pd.read_csv(csv_path)

    # 1. Latency Comparison (Mean & P95 vs Node Count under 25% Loss)
    plt.figure(figsize=(7, 5))
    df_loss25 = df[df['loss_rate'] == 0.25]

    for strat, color, style in [('fixed', '#f59e0b', '--'), ('adaptive', '#3b82f6', '-')]:
        sub = df_loss25[df_loss25['strategy'] == strat].groupby('node_count')['p95_latency_ms'].mean()
        plt.plot(sub.index, sub.values, label=f'{strat.title()} Strategy (P95 Latency)', color=color, linestyle=style, marker='o', lw=2)

    plt.xlabel('Number of Virtual Devices (Nodes)')
    plt.ylabel('P95 Latency (ms)')
    plt.title('End-to-End Latency vs Network Scale (25% Packet Loss)')
    plt.legend()
    plt.grid(True, alpha=0.3)
    plt.savefig(os.path.join(img_dir, 'latency_comparison.png'), dpi=200, bbox_inches='tight')
    plt.close()

    # 2. Packet Delivery Ratio (PDR %) Comparison
    plt.figure(figsize=(7, 5))
    for strat, color in [('fixed', '#ef4444'), ('adaptive', '#10b981')]:
        sub = df[df['strategy'] == strat].groupby('loss_rate')['pdr_pct'].mean()
        plt.plot(sub.index * 100, sub.values, label=f'{strat.title()} Strategy', color=color, marker='s', lw=2)

    plt.xlabel('Simulated Network Packet Loss (%)')
    plt.ylabel('Packet Delivery Ratio (PDR %)')
    plt.title('Packet Delivery Ratio under Simulated Loss Rates')
    plt.legend()
    plt.grid(True, alpha=0.3)
    plt.savefig(os.path.join(img_dir, 'pdr_comparison.png'), dpi=200, bbox_inches='tight')
    plt.close()

    # 3. Data Freshness / Age of Information (AoI ms)
    plt.figure(figsize=(7, 5))
    for strat, color in [('fixed', '#8b5cf6'), ('adaptive', '#06b6d4')]:
        sub = df[df['strategy'] == strat].groupby('node_count')['aoi_ms'].mean()
        plt.plot(sub.index, sub.values, label=f'{strat.title()} Strategy', color=color, marker='^', lw=2)

    plt.xlabel('Number of Virtual Devices (Nodes)')
    plt.ylabel('Age of Information / Data Freshness (ms)')
    plt.title('Data Freshness (AoI) vs Network Scale')
    plt.legend()
    plt.grid(True, alpha=0.3)
    plt.savefig(os.path.join(img_dir, 'freshness_comparison.png'), dpi=200, bbox_inches='tight')
    plt.close()

    # 4. Alert Delivery Time (ms)
    plt.figure(figsize=(7, 5))
    for strat, color in [('fixed', '#f43f5e'), ('adaptive', '#3b82f6')]:
        sub = df[df['strategy'] == strat].groupby('loss_rate')['alert_delivery_ms'].mean()
        plt.plot(sub.index * 100, sub.values, label=f'{strat.title()} Strategy Priority Channel', color=color, marker='d', lw=2)

    plt.xlabel('Simulated Network Packet Loss (%)')
    plt.ylabel('Urgent Alert Delivery Time (ms)')
    plt.title('Urgent Alert Delivery Time vs Network Loss')
    plt.legend()
    plt.grid(True, alpha=0.3)
    plt.savefig(os.path.join(img_dir, 'alert_delivery_comparison.png'), dpi=200, bbox_inches='tight')
    plt.close()

    print("All comparison plots generated successfully in docs/images/")

if __name__ == '__main__':
    generate()
