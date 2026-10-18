import os
import pandas as pd
import matplotlib.pyplot as plt

def generate():
    results_dir = os.path.join(os.path.dirname(__file__), '..', 'docs', 'data', 'results')
    agg_csv_path = os.path.join(results_dir, 'aggregated_metrics.csv')
    legacy_csv_path = os.path.join(os.path.dirname(__file__), '..', 'docs', 'data', 'experiment_results.csv')
    img_dir = os.path.join(os.path.dirname(__file__), '..', 'docs', 'images')
    os.makedirs(img_dir, exist_ok=True)

    csv_path = agg_csv_path if os.path.exists(agg_csv_path) else legacy_csv_path
    if not os.path.exists(csv_path):
        print(f"Neither {agg_csv_path} nor {legacy_csv_path} was found.")
        return

    df = pd.read_csv(csv_path)
    print(f"Reading empirical dataset from: {csv_path}")

    # Standardize column names between aggregated and legacy
    pdr_col = 'pdr_mean_pct' if 'pdr_mean_pct' in df.columns else 'pdr_pct'
    aoi_p95_col = 'p95_aoi_ms' if 'p95_aoi_ms' in df.columns else 'aoi_ms'
    alert_col = 'alert_delivery_ms'

    # 1. Packet Delivery Ratio (PDR %) vs Configured Packet Loss Rate
    plt.figure(figsize=(7, 5))
    for strat, color, marker in [('fixed', '#ef4444', 's'), ('adaptive', '#10b981', 'o')]:
        sub = df[df['strategy'] == strat].groupby('loss_rate')[pdr_col].mean()
        plt.plot(sub.index * 100, sub.values, label=f'{strat.title()} Strategy (Empirical)', color=color, marker=marker, lw=2.2, markersize=7)

    # Reference ideal line
    loss_vals = [0, 10, 25]
    plt.plot(loss_vals, [100, 90, 75], label='Theoretical Maximum (1 - Loss)', color='#64748b', linestyle=':', lw=1.5)

    plt.xlabel('Configured Network Packet Loss (%)', fontsize=11, fontweight='bold')
    plt.ylabel('Packet Delivery Ratio (PDR %)', fontsize=11, fontweight='bold')
    plt.title('Packet Delivery Ratio (PDR %) vs Simulated Packet Loss', fontsize=12, fontweight='bold')
    plt.ylim(50, 105)
    plt.legend(frameon=True)
    plt.grid(True, alpha=0.3)
    pdr_plot_path = os.path.join(img_dir, 'pdr_comparison.png')
    plt.savefig(pdr_plot_path, dpi=200, bbox_inches='tight')
    plt.close()
    print(f"Generated: {pdr_plot_path}")

    # 2. P95 Arrival Freshness (AoI at Reception ms) vs Node Density (Network Scale)
    plt.figure(figsize=(7, 5))
    for strat, color, marker, style in [('fixed', '#8b5cf6', '^', '--'), ('adaptive', '#06b6d4', 'o', '-')]:
        sub = df[df['strategy'] == strat].groupby('node_count')[aoi_p95_col].mean()
        plt.plot(sub.index, sub.values, label=f'{strat.title()} Strategy (P95 Arrival AoI)', color=color, marker=marker, linestyle=style, lw=2.2, markersize=7)

    plt.xlabel('Number of Monitored ICU Beds (Node Count)', fontsize=11, fontweight='bold')
    plt.ylabel('P95 Arrival Freshness (AoI at Reception ms)', fontsize=11, fontweight='bold')
    plt.title('P95 Arrival Freshness (AoI at Reception) vs Ward Scale', fontsize=12, fontweight='bold')
    plt.legend(frameon=True)
    plt.grid(True, alpha=0.3)
    aoi_plot_path = os.path.join(img_dir, 'freshness_comparison.png')
    plt.savefig(aoi_plot_path, dpi=200, bbox_inches='tight')
    plt.close()
    print(f"Generated: {aoi_plot_path}")

    # 3. Mean Alert Delivery Latency vs Network Packet Loss
    plt.figure(figsize=(7, 5))
    for strat, color, marker in [('fixed', '#f43f5e', 'd'), ('adaptive', '#3b82f6', 'o')]:
        sub = df[df['strategy'] == strat].groupby('loss_rate')[alert_col].mean()
        plt.plot(sub.index * 100, sub.values, label=f'{strat.title()} Strategy (Mean Alert Delay)', color=color, marker=marker, lw=2.2, markersize=7)

    plt.xlabel('Simulated Network Packet Loss (%)', fontsize=11, fontweight='bold')
    plt.ylabel('Mean Alert Delivery Latency (ms)', fontsize=11, fontweight='bold')
    plt.title('Mean Urgent Deterioration Alert Latency vs Loss Rate', fontsize=12, fontweight='bold')
    plt.legend(frameon=True)
    plt.grid(True, alpha=0.3)
    alert_plot_path = os.path.join(img_dir, 'alert_delivery_comparison.png')
    plt.savefig(alert_plot_path, dpi=200, bbox_inches='tight')
    plt.close()
    print(f"Generated: {alert_plot_path}")

    # 4. End-to-End Transport Latency vs Network Scale
    plt.figure(figsize=(7, 5))
    df_loss25 = df[df['loss_rate'] == 0.25]
    for strat, color, style, marker in [('fixed', '#f59e0b', '--', 's'), ('adaptive', '#3b82f6', '-', 'o')]:
        sub = df_loss25[df_loss25['strategy'] == strat].groupby('node_count')['p95_latency_ms'].mean()
        if len(sub) > 0:
            plt.plot(sub.index, sub.values, label=f'{strat.title()} Strategy (25% Loss)', color=color, linestyle=style, marker=marker, lw=2.2)

    plt.xlabel('Number of Virtual Devices (Nodes)', fontsize=11, fontweight='bold')
    plt.ylabel('P95 End-to-End Latency (ms)', fontsize=11, fontweight='bold')
    plt.title('P95 Transport Latency vs Scale under 25% Loss', fontsize=12, fontweight='bold')
    plt.legend(frameon=True)
    plt.grid(True, alpha=0.3)
    lat_plot_path = os.path.join(img_dir, 'latency_comparison.png')
    plt.savefig(lat_plot_path, dpi=200, bbox_inches='tight')
    plt.close()
    print(f"Generated: {lat_plot_path}")

    # 5. Throughput (Messages/sec) vs Node Count
    if 'throughput_msg_sec' in df.columns:
        plt.figure(figsize=(7, 5))
        for strat, color, marker in [('fixed', '#ea580c', 's'), ('adaptive', '#0284c7', 'o')]:
            sub = df[df['strategy'] == strat].groupby('node_count')['throughput_msg_sec'].mean()
            plt.plot(sub.index, sub.values, label=f'{strat.title()} Strategy (Msg/sec)', color=color, marker=marker, lw=2.2, markersize=7)

        plt.xlabel('Number of Virtual Devices (Nodes)', fontsize=11, fontweight='bold')
        plt.ylabel('Ingest Throughput (Messages/second)', fontsize=11, fontweight='bold')
        plt.title('Channel Ingest Throughput vs Node Count', fontsize=12, fontweight='bold')
        plt.legend(frameon=True)
        plt.grid(True, alpha=0.3)
        tput_plot_path = os.path.join(img_dir, 'throughput_comparison.png')
        plt.savefig(tput_plot_path, dpi=200, bbox_inches='tight')
        plt.close()
        print(f"Generated: {tput_plot_path}")

    print("Empirical comparison plots successfully generated in docs/images/")

if __name__ == '__main__':
    generate()
