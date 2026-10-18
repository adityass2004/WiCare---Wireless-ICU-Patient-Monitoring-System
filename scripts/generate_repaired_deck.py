import os
import sys
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE

def build_repaired_deck(output_path="WiCare_WMC_Presentation_Repaired.pptx"):
    prs = Presentation()
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)

    # -------------------------------------------------------------
    # Curated Scientific Design Palette (Restrained, Contemporary)
    # -------------------------------------------------------------
    LIGHT_BG = RGBColor(250, 250, 252)    # #FAFAFC Off-white / Pure Neutral
    CARD_BG = RGBColor(255, 255, 255)     # #FFFFFF Pure White
    DARK_BG = RGBColor(15, 23, 42)        # #0F172A Deep Slate / Charcoal
    DARK_CARD = RGBColor(30, 41, 59)      # #1E293B
    CHARCOAL = RGBColor(15, 23, 42)       # #0F172A Primary text
    SLATE_BODY = RGBColor(51, 65, 85)     # #334155 Secondary text
    MUTED_GRAY = RGBColor(100, 116, 139)  # #64748B Tertiary / Rule
    BORDER_LIGHT = RGBColor(226, 232, 240)# #E2E8F0 Subtle outline
    BORDER_DARK = RGBColor(51, 65, 85)    # #334155
    COBALT = RGBColor(29, 78, 216)        # #1D4ED8 Primary Cobalt
    DEEP_BLUE = RGBColor(30, 58, 138)     # #1E3A8A Deep Blue
    CYAN_ACCENT = RGBColor(2, 132, 199)   # #0284C7 Clinical Cyan
    ALERT_RED = RGBColor(220, 38, 38)     # #DC2626 Critical / Packet loss
    SUCCESS_GREEN = RGBColor(5, 150, 105) # #059669 Verified success
    PILL_BG = RGBColor(241, 245, 249)     # #F1F5F9 Soft badge

    def add_blank_slide(bg_color=LIGHT_BG):
        slide = prs.slides.add_slide(prs.slide_layouts[6])
        bg = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, Inches(13.333), Inches(7.5))
        bg.fill.solid()
        bg.fill.fore_color.rgb = bg_color
        bg.line.fill.background()
        return slide

    def add_header(slide, kicker, title, dark=False):
        # Category / Kicker
        kicker_box = slide.shapes.add_textbox(Inches(0.8), Inches(0.45), Inches(11.733), Inches(0.28))
        tf_k = kicker_box.text_frame
        tf_k.word_wrap = True
        tf_k.margin_left = tf_k.margin_right = tf_k.margin_top = tf_k.margin_bottom = 0
        pk = tf_k.paragraphs[0]
        pk.text = kicker.upper()
        pk.font.size = Pt(9.5)
        pk.font.bold = True
        pk.font.color.rgb = RGBColor(56, 189, 248) if dark else COBALT
        pk.font.name = "Segoe UI"

        # Main Title
        title_box = slide.shapes.add_textbox(Inches(0.8), Inches(0.72), Inches(11.733), Inches(0.55))
        tf_t = title_box.text_frame
        tf_t.word_wrap = True
        tf_t.margin_left = tf_t.margin_right = tf_t.margin_top = tf_t.margin_bottom = 0
        pt = tf_t.paragraphs[0]
        pt.text = title
        pt.font.size = Pt(19)
        pt.font.bold = True
        pt.font.color.rgb = RGBColor(255, 255, 255) if dark else CHARCOAL
        pt.font.name = "Segoe UI"

        # Structural divider
        line = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0.8), Inches(1.32), Inches(11.733), Inches(0.015))
        line.fill.solid()
        line.fill.fore_color.rgb = BORDER_DARK if dark else BORDER_LIGHT
        line.line.fill.background()

    def add_footer(slide, current_num, total_num=10, dark=False):
        footer_box = slide.shapes.add_textbox(Inches(0.8), Inches(7.05), Inches(11.733), Inches(0.3))
        tf = footer_box.text_frame
        tf.word_wrap = True
        tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
        p = tf.paragraphs[0]
        p.text = "WiCare: Wireless ICU Patient Telemetry System   |   Research Review & Evaluation Deck"
        p.font.size = Pt(8.5)
        p.font.color.rgb = RGBColor(148, 163, 184) if dark else MUTED_GRAY
        p.font.name = "Segoe UI"
        
        p_num = tf.add_paragraph()
        p_num.alignment = PP_ALIGN.RIGHT
        p_num.text = f"{current_num:02d} / {total_num:02d}"
        p_num.font.size = Pt(8.5)
        p_num.font.bold = True
        p_num.font.color.rgb = RGBColor(148, 163, 184) if dark else CHARCOAL
        p_num.font.name = "Segoe UI"

    # =========================================================================
    # SLIDE 1: MINIMAL EDITORIAL TITLE SLIDE
    # =========================================================================
    s1 = add_blank_slide(bg_color=DARK_BG)
    
    t_box = s1.shapes.add_textbox(Inches(0.8), Inches(1.15), Inches(11.733), Inches(2.2))
    tf1 = t_box.text_frame
    tf1.word_wrap = True
    
    p0 = tf1.paragraphs[0]
    p0.text = "WIRELESS MEDICAL COMMUNICATION (WMC) RESEARCH EVALUATION"
    p0.font.size = Pt(10.5)
    p0.font.bold = True
    p0.font.color.rgb = RGBColor(56, 189, 248) # Medical Cyan
    p0.font.name = "Segoe UI"
    p0.space_after = Pt(8)

    p1 = tf1.add_paragraph()
    p1.text = "WiCare: Wireless ICU Patient Telemetry & Communication System"
    p1.font.size = Pt(27)
    p1.font.bold = True
    p1.font.color.rgb = RGBColor(255, 255, 255)
    p1.font.name = "Segoe UI"
    p1.space_after = Pt(10)

    p2 = tf1.add_paragraph()
    p2.text = "Acuity-Adaptive Telemetry Pacing and Congestion Backoff under Radio Link Impairments"
    p2.font.size = Pt(13.5)
    p2.font.color.rgb = RGBColor(203, 213, 225)
    p2.font.name = "Segoe UI"

    # Restrained System Pipeline Motif (Minimalist Vector Blocks)
    flow_bg = s1.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.8), Inches(3.55), Inches(11.733), Inches(1.75))
    flow_bg.fill.solid()
    flow_bg.fill.fore_color.rgb = DARK_CARD
    flow_bg.line.color.rgb = BORDER_DARK
    flow_bg.line.width = Pt(1)

    steps_s1 = [
        ("Bedside Virtual Nodes", "10 to 50 ICU beds generating multi-vital telemetry (HR, SpO2, BP, ECG) every 100ms"),
        ("Acuity & Backoff Engine", "Dynamically paces rate: 1.0 Hz stable -> 3.33 Hz acute; 1.30x backoff at 25% loss"),
        ("Pre-Socket Impairment", "Software emulator injecting 0-25% drop probability, 30ms delay, and ±10ms jitter"),
        ("Embedded MQTT Broker", "Aedes broker managing TCP topics (`vitals` vs `critical`), evaluating QoS 0 & QoS 1"),
        ("Central Nursing Station", "Fastify ingest, sequence gap deduplication, threshold alerting, and Next.js live UI")
    ]
    for i, (stitle, sdesc) in enumerate(steps_s1):
        x_pos = Inches(1.0 + i * 2.3)
        b = s1.shapes.add_textbox(x_pos, Inches(3.7), Inches(2.1), Inches(1.45))
        tf = b.text_frame
        tf.word_wrap = True
        tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
        
        ps = tf.paragraphs[0]
        ps.text = f"{i+1:02d}. {stitle}"
        ps.font.size = Pt(10)
        ps.font.bold = True
        ps.font.color.rgb = RGBColor(56, 189, 248)
        ps.font.name = "Segoe UI"
        ps.space_after = Pt(4)

        pd = tf.add_paragraph()
        pd.text = sdesc
        pd.font.size = Pt(8.5)
        pd.font.color.rgb = RGBColor(226, 232, 240)
        pd.font.name = "Segoe UI"

    # Presenter Details & Metadata
    meta_box = s1.shapes.add_textbox(Inches(0.8), Inches(5.65), Inches(11.733), Inches(0.8))
    tf_m = meta_box.text_frame
    tf_m.word_wrap = True
    
    pm1 = tf_m.paragraphs[0]
    pm1.text = "Author: Aditya S. S.   |   Department of Electronics & Communication Engineering   |   Dayananda Sagar College of Engineering"
    pm1.font.size = Pt(10.5)
    pm1.font.bold = True
    pm1.font.color.rgb = RGBColor(255, 255, 255)
    pm1.font.name = "Segoe UI"
    pm1.space_after = Pt(3)

    pm2 = tf_m.add_paragraph()
    pm2.text = "Experimental Scope: 108 Factorial Benchmark Runs across 36 Conditions (10–50 Beds, 0–25% Loss, QoS 0/1, 3 Seeds)"
    pm2.font.size = Pt(9.5)
    pm2.font.color.rgb = RGBColor(148, 163, 184)
    pm2.font.name = "Segoe UI"

    add_footer(s1, 1, 10, dark=True)
    s1.notes_slide.notes_text_frame.text = (
        "Good morning, committee members. Today I present WiCare, an empirical research evaluation of an acuity-adaptive "
        "wireless medical telemetry architecture designed for intensive care units. In modern hospital wards, tethered cables "
        "create severe hazards and restrict patient mobilization. However, moving to wireless medical telemetry introduces "
        "channel attenuation, interference, and packet dropouts. WiCare addresses these challenges through an acuity-adaptive "
        "transmission engine that accelerates vital sampling during clinical deterioration while automatically enforcing congestion "
        "backoff under network stress. Over the next nine slides, I will present our system architecture, adaptive mathematical "
        "formulation, legacy measurement corrections, and empirical benchmark results across 108 verified runs."
    )

    # =========================================================================
    # SLIDE 2: PROBLEM & RESEARCH OBJECTIVE (Split-Screen Trade-off)
    # =========================================================================
    s2 = add_blank_slide()
    add_header(s2, "Problem & Research Objective", "The Clinical & Wireless Telemetry Dilemma in Modern ICUs")

    # 3 Distinct Columns (Problem Breakdown)
    col_w = Inches(3.64)
    col_h = Inches(3.65)
    col_y = Inches(1.58)

    prob_cards = [
        ("The Physical Cable Dilemma", ALERT_RED,
         [("Patient Mobilization Barriers", "Continuous multi-parameter cables physically tether patients to bed frames, delaying early ambulation proven to reduce ICU delirium and length of stay."),
          ("Clinical Hazards & Line Dislodgement", "Wire clutter obstructs rapid nursing interventions during emergency CPR and risks catastrophic accidental line dislodgement during bed articulation."),
          ("False Sensor Disconnects", "Mechanical tension on leads causes recurring contact disconnects and nuisance alarms.")]),

        ("The Shared Wireless Channel Reality", COBALT,
         [("Hostile In-Hospital RF Environment", "Intensive care units experience severe electromagnetic interference (EMI) from diagnostic equipment and multipath attenuation from metallic structural fixtures."),
          ("Channel Contention in Scaled Wards", "Concurrent vital streaming from 10 to 50 beds sharing unlicensed 2.4 GHz ISM spectrum leads to radio packet collisions."),
          ("Link Dropout & Jitter", "Unbuffered radio fading causes intermittent burst packet loss and transport jitter, jeopardizing telemetry continuity.")]),

        ("The Inefficiency of Rigid Telemetry", CHARCOAL,
         [("Bandwidth Waste on Stable Patients", "Conventional telemetry transmits at a rigid periodic interval (e.g., 1.0 Hz), needlessly consuming radio airtime and battery on stable beds."),
          ("Detection Delay on Acute Collapse", "During sudden hemodynamic desaturation, rigid 1.0 Hz intervals introduce hazardous delay in propagating alarm-triggering frames."),
          ("Alarm Fatigue", "Over 85–99% of hospital alarms are non-actionable, desensitizing clinical staff and delaying response to true emergency events.")])
    ]

    for i, (title, color_top, bullets) in enumerate(prob_cards):
        cx = Inches(0.8 + i * 4.04)
        c_bg = s2.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, cx, col_y, col_w, col_h)
        c_bg.fill.solid()
        c_bg.fill.fore_color.rgb = CARD_BG
        c_bg.line.color.rgb = BORDER_LIGHT
        c_bg.line.width = Pt(0.75)

        # Header band
        hb = s2.shapes.add_shape(MSO_SHAPE.RECTANGLE, cx, col_y, col_w, Inches(0.06))
        hb.fill.solid()
        hb.fill.fore_color.rgb = color_top
        hb.line.fill.background()

        tb = s2.shapes.add_textbox(cx + Inches(0.2), col_y + Inches(0.18), col_w - Inches(0.4), col_h - Inches(0.3))
        tf = tb.text_frame
        tf.word_wrap = True

        pt = tf.paragraphs[0]
        pt.text = title
        pt.font.size = Pt(12)
        pt.font.bold = True
        pt.font.color.rgb = CHARCOAL
        pt.font.name = "Segoe UI"
        pt.space_after = Pt(8)

        for btitle, bdesc in bullets:
            pb = tf.add_paragraph()
            pb.text = f"•  {btitle}: "
            pb.font.size = Pt(9.5)
            pb.font.bold = True
            pb.font.color.rgb = CHARCOAL
            pb.font.name = "Segoe UI"

            r = pb.add_run()
            r.text = bdesc
            r.font.bold = False
            r.font.color.rgb = SLATE_BODY
            pb.space_after = Pt(6)

    # Core Research Question Callout Banner
    q_box = s2.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.8), Inches(5.42), Inches(11.733), Inches(1.35))
    q_box.fill.solid()
    q_box.fill.fore_color.rgb = PILL_BG
    q_box.line.color.rgb = BORDER_LIGHT

    q_tb = s2.shapes.add_textbox(Inches(1.05), Inches(5.5), Inches(11.233), Inches(1.2))
    q_tf = q_tb.text_frame
    q_tf.word_wrap = True
    qp1 = q_tf.paragraphs[0]
    qp1.text = "CORE RESEARCH QUESTION"
    qp1.font.size = Pt(9)
    qp1.font.bold = True
    qp1.font.color.rgb = COBALT
    qp1.font.name = "Segoe UI"
    qp1.space_after = Pt(2)

    qp2 = q_tf.add_paragraph()
    qp2.text = (
        "\"How can an edge-assisted medical telemetry architecture dynamically allocate wireless transmission "
        "capacity to deteriorating ICU patients while automatically throttling non-critical traffic to prevent "
        "network congestion and queue collapse during severe radio link impairment?\""
    )
    qp2.font.size = Pt(11)
    qp2.font.bold = True
    qp2.font.color.rgb = CHARCOAL
    qp2.font.name = "Segoe UI"

    add_footer(s2, 2, 10)
    s2.notes_slide.notes_text_frame.text = (
        "Continuous patient monitoring is mandatory in ICUs, but physical wiring has severe drawbacks. Tethered lines "
        "complicate nursing procedures and prevent early patient ambulation, which is clinically known to speed recovery. "
        "However, replacing wires with wireless links introduces medical communication challenges. Hospital environments suffer from "
        "RF attenuation and interference. Furthermore, transmitting vitals at a fixed periodic rate is fundamentally flawed: "
        "stable patients consume bandwidth unnecessarily, while for deteriorating patients, a 1-second delay in alert delivery "
        "can be critical. WiCare investigates how to dynamically allocate bandwidth to deteriorating patients while preventing "
        "channel collapse during congestion."
    )

    # =========================================================================
    # SLIDE 3: SYSTEM ARCHITECTURE (Visual Flow Diagram)
    # =========================================================================
    s3 = add_blank_slide()
    add_header(s3, "System Architecture", "End-to-End Telemetry Pipeline: Bedside Edge to Central Station")

    # Visual Architecture Diagram (Left-to-Right Vector Pipeline)
    box_w = Inches(2.1)
    box_h = Inches(3.6)
    box_y = Inches(1.6)

    nodes = [
        ("1. Bedside Virtual Edge", COBALT,
         [("VirtualPatient", "Models HR, SpO2, BP, RR, Temp, ECG every 100ms."),
          ("Adaptive Engine", "Computes interval: 1000ms baseline vs. 300ms acute."),
          ("Ring Buffer", "100-frame capacity; drop-oldest overflow management.")]),

        ("2. Channel Emulation", ALERT_RED,
         [("Pre-Socket Hook", "Intercepts serialized JSON buffer before TCP socket."),
          ("Drop Injection", "Evaluates drop rate p in [0, 0.25] via seeded RNG."),
          ("Delay & Jitter", "30ms fixed delay + ±10ms timer jitter emulated.")]),

        ("3. MQTT Transport", DEEP_BLUE,
         [("Aedes Broker", "In-process MQTT broker on TCP ports 1883/19100+."),
          ("Topic Separation", "`.../vitals` (routine) vs `.../vitals/critical`."),
          ("QoS 0 vs. QoS 1", "Evaluates at-most-once vs at-least-once transport.")]),

        ("4. Ingestion & Registry", CHARCOAL,
         [("Subscriber Daemon", "Decodes JSON, checks Zod schemas, logs timestamps."),
          ("Device Registry", "Sliding window sequence gap deduplication."),
          ("Alert Engine", "Evaluates Warning/Critical threshold rules.")]),

        ("5. Presentation & UI", SUCCESS_GREEN,
         [("Fastify Server", "REST census API & Socket.IO WebSocket gateway."),
          ("Batch MySQL", "Asynchronous bulk DB insert every 1000ms via Prisma."),
          ("Next.js 14 Ward", "Real-time bed grid, dynamic ECG traces, alert banner.")])
    ]

    for i, (ntitle, ncol, nitems) in enumerate(nodes):
        nx = Inches(0.8 + i * 2.41)
        nbg = s3.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, nx, box_y, box_w, box_h)
        nbg.fill.solid()
        nbg.fill.fore_color.rgb = CARD_BG
        nbg.line.color.rgb = BORDER_LIGHT
        nbg.line.width = Pt(0.75)

        # Header strip
        nh = s3.shapes.add_shape(MSO_SHAPE.RECTANGLE, nx, box_y, box_w, Inches(0.35))
        nh.fill.solid()
        nh.fill.fore_color.rgb = ncol
        nh.line.fill.background()

        ntb = s3.shapes.add_textbox(nx + Inches(0.08), box_y + Inches(0.04), box_w - Inches(0.16), Inches(0.28))
        np = ntb.text_frame.paragraphs[0]
        np.text = ntitle
        np.font.size = Pt(9.5)
        np.font.bold = True
        np.font.color.rgb = RGBColor(255, 255, 255)
        np.font.name = "Segoe UI"

        # Content
        nb = s3.shapes.add_textbox(nx + Inches(0.12), box_y + Inches(0.42), box_w - Inches(0.24), box_h - Inches(0.5))
        tf = nb.text_frame
        tf.word_wrap = True

        for idx, (ititle, idesc) in enumerate(nitems):
            pi = tf.add_paragraph() if idx > 0 else tf.paragraphs[0]
            pi.text = f"• {ititle}"
            pi.font.size = Pt(9)
            pi.font.bold = True
            pi.font.color.rgb = CHARCOAL
            pi.font.name = "Segoe UI"
            pi.space_after = Pt(1)

            pd = tf.add_paragraph()
            pd.text = idesc
            pd.font.size = Pt(8.2)
            pd.font.color.rgb = SLATE_BODY
            pd.font.name = "Segoe UI"
            pd.space_after = Pt(5)

        # Connector arrow between blocks
        if i < len(nodes) - 1:
            arr = s3.shapes.add_shape(MSO_SHAPE.RIGHT_ARROW, nx + box_w + Inches(0.06), box_y + Inches(1.6), Inches(0.19), Inches(0.2))
            arr.fill.solid()
            arr.fill.fore_color.rgb = MUTED_GRAY
            arr.line.fill.background()

    # Pre-Publication Boundary Notice & Optional Services
    b_card = s3.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.8), Inches(5.4), Inches(11.733), Inches(1.38))
    b_card.fill.solid()
    b_card.fill.fore_color.rgb = PILL_BG
    b_card.line.color.rgb = BORDER_LIGHT

    b_tb = s3.shapes.add_textbox(Inches(1.0), Inches(5.48), Inches(11.333), Inches(1.22))
    b_tf = b_tb.text_frame
    b_tf.word_wrap = True
    bp1 = b_tf.paragraphs[0]
    bp1.text = "ARCHITECTURAL BOUNDARIES & OPTIONAL SERVICES DISCLOSURE"
    bp1.font.size = Pt(9)
    bp1.font.bold = True
    bp1.font.color.rgb = CHARCOAL
    bp1.font.name = "Segoe UI"
    bp1.space_after = Pt(2)

    bp2 = b_tf.add_paragraph()
    bp2.text = (
        "1. Impairment Injection Point: Simulated packet loss occurs in user space within NetworkEmulator BEFORE `mqttClient.publish()`. "
        "Surviving packets travel over local TCP loopback (127.0.0.1). Therefore, MQTT QoS 1 retransmission across lossy physical RF is not exercised.\n"
        "2. Optional Intelligence Services: Python FastAPI microservice (Isolation Forest risk score) and Gemini LLM explainer are modular standalone services, "
        "strictly decoupled from the core 108-run simulation benchmark pipeline."
    )
    bp2.font.size = Pt(8.5)
    bp2.font.color.rgb = SLATE_BODY
    bp2.font.name = "Segoe UI"

    add_footer(s3, 3, 10)
    s3.notes_slide.notes_text_frame.text = (
        "This slide illustrates the full five-stage architectural pipeline of WiCare. At the edge, virtual patients update "
        "physiological models every 100ms. An adaptive transmission strategy determines when frames are queued. Packets pass "
        "through a pre-socket network emulator that injects controlled loss, delay, and jitter before calling the MQTT client. "
        "Surviving packets are published to an embedded Aedes MQTT broker over TCP. At the central station, our subscriber "
        "decodes telemetry, updates device registry sequence tracking to deduplicate out-of-order packets, evaluates clinical "
        "thresholds, pushes real-time updates over WebSockets to the Next.js dashboard, and asynchronously batches database "
        "writes to MySQL. Notice the bottom callout: packet loss is injected pre-publication, and optional AI services are "
        "strictly modular and decoupled from the headless benchmark."
    )

    # =========================================================================
    # SLIDE 4: ADAPTIVE TRANSMISSION & CONGESTION CONTROL MECHANISM
    # =========================================================================
    s4 = add_blank_slide()
    add_header(s4, "Adaptive Mechanics & Proof", "Dual-Regime Acuity Adaptation & Linear Congestion Backoff")

    col_w = Inches(5.6)
    col_h = Inches(4.8)
    col_y = Inches(1.6)

    # Left: Mechanism & Formula
    l_bg = s4.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.8), col_y, col_w, col_h)
    l_bg.fill.solid()
    l_bg.fill.fore_color.rgb = CARD_BG
    l_bg.line.color.rgb = BORDER_LIGHT

    tb_l = s4.shapes.add_textbox(Inches(1.05), col_y + Inches(0.18), col_w - Inches(0.5), col_h - Inches(0.35))
    tf_l = tb_l.text_frame
    tf_l.word_wrap = True

    pl = tf_l.paragraphs[0]
    pl.text = "Mathematical Formulation & Pacing Logic"
    pl.font.size = Pt(12)
    pl.font.bold = True
    pl.font.color.rgb = CHARCOAL
    pl.font.name = "Segoe UI"
    pl.space_after = Pt(8)

    items_l = [
        ("Baseline Telemetry Interval", "T_base = 1000 ms (1.0 Hz periodic streaming during normal stable vitals)."),
        ("Acuity Acceleration Trigger", "Evaluates vitals: SpO2 < 94%, HR > 110 or < 55 bpm, or acute scenario ('falling_spo2').\nAction: T_clinical = min(T_base, 300 ms) = 300 ms (3.33 Hz, +233% frequency boost) published to priority topic (`.../vitals/critical`) with QoS 1."),
        ("Linear Congestion Backoff Multiplier", "Activates when measured channel loss exceeds 15% (tau_loss = 0.15):\n   M_cong = 1.0 + (p_loss - 0.15) * 3.0\nAt 25% Loss: M_cong = 1.0 + (0.25 - 0.15) * 3.0 = 1.30x multiplier.\nEffect on Stable Nodes: T_stable = 1000 ms * 1.30 = 1300 ms (30% throttle).\nPrevents channel saturation while preserving bandwidth for acute nodes."),
        ("Guaranteed Clamping Bounds", "Strict interval clamping: 200 ms <= T_target <= 3000 ms.\nGuarantees high-acuity bounds while ensuring a 3-second heartbeat.")
    ]
    for h, b in items_l:
        p_h = tf_l.add_paragraph()
        p_h.text = f"•  {h}"
        p_h.font.size = Pt(9.5)
        p_h.font.bold = True
        p_h.font.color.rgb = DEEP_BLUE
        p_h.font.name = "Segoe UI"
        p_h.space_after = Pt(1)

        p_b = tf_l.add_paragraph()
        p_b.text = b
        p_b.font.size = Pt(8.5)
        p_b.font.color.rgb = SLATE_BODY
        p_b.font.name = "Segoe UI"
        p_b.space_after = Pt(6)

    # Right: Analytical Proof of the 398-Frame Benchmark
    r_bg = s4.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(6.93), col_y, col_w, col_h)
    r_bg.fill.solid()
    r_bg.fill.fore_color.rgb = CARD_BG
    r_bg.line.color.rgb = BORDER_LIGHT

    tb_r = s4.shapes.add_textbox(Inches(7.18), col_y + Inches(0.18), col_w - Inches(0.5), col_h - Inches(0.35))
    tf_r = tb_r.text_frame
    tf_r.word_wrap = True

    pr = tf_r.paragraphs[0]
    pr.text = "Empirical Proof: The Verified 398-Frame Benchmark"
    pr.font.size = Pt(12)
    pr.font.bold = True
    pr.font.color.rgb = CHARCOAL
    pr.font.name = "Segoe UI"
    pr.space_after = Pt(8)

    items_r = [
        ("Benchmark Operational Conditions", "10 ICU Beds, 0% Packet Loss, 30-Second Simulation Window.\nAt t = 10.0s (tick 99), 20% of beds (2 beds) experience acute SpO2 desaturation."),
        ("Stable Beds Contribution (8 Beds)", "8 beds transmit continuously at T_base = 1000 ms across 30 seconds:\n8 beds * 30 frames = 240 frames."),
        ("Deteriorating Beds Contribution (2 Beds)", "• Ticks 0–98 (0.0–9.9s): 1000ms interval -> 9 frames dispatched, 900ms accumulator.\n• Tick 99 (t = 10.0s): Interval drops to 300ms -> 900ms / 300ms = 3 frames burst.\n• Ticks 99–299 (10.0–30.0s): 20.1s at 300ms interval -> 67 frames dispatched.\n• Total per acute bed: 9 + 3 + 67 = 79 frames.\n• For 2 acute beds: 2 * 79 = 158 frames."),
        ("Total Ingest Throughput Calculation", "Total Dispatched & Received Frames = 240 + 158 = 398 frames.\nChannel Throughput = 398 frames / 30.0 s = 13.27 msg/s.\nSurge over Fixed Baseline (10.00 msg/s): exactly +32.7%.\nVerified identically in raw runs 3, 4, 5, 9, 10, 11.")
    ]
    for h, b in items_r:
        p_h = tf_r.add_paragraph()
        p_h.text = f"•  {h}"
        p_h.font.size = Pt(9.5)
        p_h.font.bold = True
        p_h.font.color.rgb = SUCCESS_GREEN if "Total" in h else CHARCOAL
        p_h.font.name = "Segoe UI"
        p_h.space_after = Pt(1)

        p_b = tf_r.add_paragraph()
        p_b.text = b
        p_b.font.size = Pt(8.5)
        p_b.font.color.rgb = SLATE_BODY
        p_b.font.name = "Segoe UI"
        p_b.space_after = Pt(6)

    add_footer(s4, 4, 10)
    s4.notes_slide.notes_text_frame.text = (
        "Here we see the core mathematics behind WiCare's adaptive transmission strategy. The strategy addresses two "
        "competing requirements: clinical temporal resolution and radio channel conservation. When vitals deteriorate, "
        "the sampling interval accelerates from 1000 milliseconds down to 300 milliseconds, tripling the update rate "
        "for critical patients. However, if network loss exceeds 15%, streaming more packets would cause queue collapse. "
        "Therefore, our linear congestion backoff formula expands stable intervals to 1300 milliseconds under 25% loss. "
        "On the right, we provide the exact mathematical proof for the 10-node clear channel case: 8 stable beds dispatch "
        "240 frames, while 2 acute beds dispatch 158 frames, producing exactly 398 frames over 30 seconds—a throughput of "
        "13.27 messages per second, or a 32.7% surge, matching our raw empirical benchmark data verbatim."
    )

    # =========================================================================
    # SLIDE 5: EXPERIMENTAL METHODOLOGY & MEASUREMENT INTEGRITY
    # =========================================================================
    s5 = add_blank_slide()
    add_header(s5, "Methodology & Measurement", "Rigorous 108-Run Factorial Simulation Matrix & Defect Audit")

    col_w = Inches(5.6)
    col_h = Inches(4.8)
    col_y = Inches(1.6)

    # Left: Parameter Matrix
    m_bg = s5.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.8), col_y, col_w, col_h)
    m_bg.fill.solid()
    m_bg.fill.fore_color.rgb = CARD_BG
    m_bg.line.color.rgb = BORDER_LIGHT

    tb_m = s5.shapes.add_textbox(Inches(1.05), col_y + Inches(0.18), col_w - Inches(0.5), col_h - Inches(0.35))
    tf_m = tb_m.text_frame
    tf_m.word_wrap = True

    pm = tf_m.paragraphs[0]
    pm.text = "108-Run Factorial Benchmark Design"
    pm.font.size = Pt(12)
    pm.font.bold = True
    pm.font.color.rgb = CHARCOAL
    pm.font.name = "Segoe UI"
    pm.space_after = Pt(8)

    m_items = [
        ("Factor 1: Node Scale Tiers (3 Levels)", "10, 25, and 50 concurrent virtual ICU patient nodes."),
        ("Factor 2: Configured Packet Loss (3 Levels)", "0.00 (0%), 0.10 (10%), and 0.25 (25%) pre-socket channel drop."),
        ("Factor 3: MQTT Transport QoS (2 Modes)", "QoS 0 (at-most-once) vs. QoS 1 (at-least-once)."),
        ("Factor 4: Transmission Strategy (2 Modes)", "Fixed Baseline (1.0 Hz) vs. Adaptive Risk-Network."),
        ("Factor 5: Pseudo-Random Seeds (3 Replications)", "Seeds `101`, `202`, and `303` across every single condition."),
        ("Factorial Formulation", "3 scales * 3 loss levels * 2 QoS * 2 strategies * 3 seeds = 108 runs."),
        ("Controlled Benchmark Variables", "Duration: 30s; Delay: 30ms; Jitter: ±10ms; Deterioration trigger: t = 10s (20% of beds); Payload: ~180 bytes.")
    ]
    for h, b in m_items:
        p_h = tf_m.add_paragraph()
        p_h.text = f"•  {h}: "
        p_h.font.size = Pt(9.2)
        p_h.font.bold = True
        p_h.font.color.rgb = DEEP_BLUE
        p_h.font.name = "Segoe UI"

        r = p_h.add_run()
        r.text = b
        r.font.bold = False
        r.font.color.rgb = SLATE_BODY
        p_h.space_after = Pt(5)

    # Right: Audited Measurement Pipeline Fixes
    a_bg = s5.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(6.93), col_y, col_w, col_h)
    a_bg.fill.solid()
    a_bg.fill.fore_color.rgb = CARD_BG
    a_bg.line.color.rgb = BORDER_LIGHT

    tb_a = s5.shapes.add_textbox(Inches(7.18), col_y + Inches(0.18), col_w - Inches(0.5), col_h - Inches(0.35))
    tf_a = tb_a.text_frame
    tf_a.word_wrap = True

    pa = tf_a.paragraphs[0]
    pa.text = "Audit & Resolution of Legacy Defects"
    pa.font.size = Pt(12)
    pa.font.bold = True
    pa.font.color.rgb = CHARCOAL
    pa.font.name = "Segoe UI"
    pa.space_after = Pt(8)

    fixes_s5 = [
        ("The 9.2% PDR Denominator Bug Resolved", ALERT_RED,
         "Legacy code incremented dispatch counts on every 100ms clock tick (10x/sec) while only publishing every 1000ms (1x/sec), causing a 10x denominator inflation (300/3000 = 9.2%).\n-> Added `messagesDispatched` getter tracking actual emulator submissions, restoring true PDR to 100.00% under 0% loss."),
        ("Synthetic Formulas Replaced with Socket Timing", COBALT,
         "Legacy scripts computed latency from static algebra ('cfg.delayMs + random').\n-> Replaced with true wall-clock millisecond socket timing deltas (t_recv - t_sent)."),
        ("Out-of-Order Sequence Gap Deduplication", CHARCOAL,
         "Transport jitter caused delayed packets to be permanently marked as lost.\n-> Updated DeviceRegistry with sliding sequence deduplication window, decrementing lost counter upon delayed gap-filling."),
        ("Alert Latency Timestamp Guard Enforced", SUCCESS_GREEN,
         "In-flight frames generated before deterioration recorded artificial 1-2ms alerts.\n-> Enforced t_gen >= t_event, restoring true condition alert latencies to 35-38ms.")
    ]
    for h, col, b in fixes_s5:
        p_h = tf_a.add_paragraph()
        p_h.text = f"•  {h}"
        p_h.font.size = Pt(9.2)
        p_h.font.bold = True
        p_h.font.color.rgb = col
        p_h.font.name = "Segoe UI"
        p_h.space_after = Pt(1)

        p_b = tf_a.add_paragraph()
        p_b.text = b
        p_b.font.size = Pt(8.2)
        p_b.font.color.rgb = SLATE_BODY
        p_b.font.name = "Segoe UI"
        p_b.space_after = Pt(5)

    add_footer(s5, 5, 10)
    s5.notes_slide.notes_text_frame.text = (
        "To evaluate WiCare scientifically, we designed a complete 108-run factorial simulation matrix spanning 36 distinct "
        "conditions. We tested three ward scales: 10, 25, and 50 beds; three channel loss rates: 0%, 10%, and 25%; both MQTT QoS 0 "
        "and QoS 1; and both fixed and adaptive strategies, repeating every configuration across three random seeds. Crucially, "
        "before running this matrix, our audit resolved four severe legacy defects: first, a denominator bug that caused PDR to "
        "be misreported as 9.2%; second, synthetic algebraic formulas that approximated latency instead of measuring real socket deltas; "
        "third, jitter-induced packet miscounting; and fourth, an alert timestamp guard that prevented pre-event packets from registering "
        "false instant alerts."
    )

    # =========================================================================
    # SLIDE 6: PDR RESULTS
    # =========================================================================
    s6 = add_blank_slide()
    add_header(s6, "Benchmark Findings: Reliability", "Delivery Reliability: PDR Exactly Aligns with Theoretical Channel Loss")

    # Left: Embed PDR Chart
    chart_pdr = "docs/images/pdr_comparison.png"
    if os.path.exists(chart_pdr):
        s6.shapes.add_picture(chart_pdr, Inches(0.8), Inches(1.6), Inches(5.8), Inches(4.8))

    # Right: Analytical Findings Card
    r6_bg = s6.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(6.9), Inches(1.6), Inches(5.633), Inches(4.8))
    r6_bg.fill.solid()
    r6_bg.fill.fore_color.rgb = CARD_BG
    r6_bg.line.color.rgb = BORDER_LIGHT

    tb_pdr = s6.shapes.add_textbox(Inches(7.15), Inches(1.8), Inches(5.15), Inches(4.4))
    tf_pdr = tb_pdr.text_frame
    tf_pdr.word_wrap = True

    pt6 = tf_pdr.paragraphs[0]
    pt6.text = "Key Verified PDR Findings"
    pt6.font.size = Pt(12)
    pt6.font.bold = True
    pt6.font.color.rgb = CHARCOAL
    pt6.font.name = "Segoe UI"
    pt6.space_after = Pt(8)

    pdr_items = [
        ("Perfect 100.00% PDR under Clear Channel (0% Loss)", SUCCESS_GREEN,
         "Across all node scales (10, 25, 50) and both QoS modes, empirical PDR is exactly 100.00% (sigma = 0.00%). Confirms zero socket drops and zero buffer overflows across clear channels."),
        ("Strict Alignment with Theoretical (1 - p) Boundary", COBALT,
         "• At 10% Configured Loss: Measured PDR ranges from 90.06% to 90.65% (sigma <= 0.93%).\n• At 25% Configured Loss: Measured PDR ranges from 75.46% to 76.82% (sigma <= 1.96%).\nEmpirical PDR tracks theoretical (1 - p) within 0.6% across all 108 runs."),
        ("PDR Invariance Across Transmission Strategy", CHARCOAL,
         "The PDR delta between Fixed and Adaptive strategies across all 18 paired conditions is statistically negligible: delta in [-0.38%, +0.38%]. Proves that accelerating telemetry during clinical deterioration does not induce packet loss."),
        ("Low Run-to-Run Variance Across Seeds", SLATE_BODY,
         "Low standard deviations (sigma <= 1.96%) across seeds 101, 202, and 303 confirm software determinism and simulation stability.")
    ]
    for h, col, b in pdr_items:
        p_h = tf_pdr.add_paragraph()
        p_h.text = f"•  {h}"
        p_h.font.size = Pt(9.5)
        p_h.font.bold = True
        p_h.font.color.rgb = col
        p_h.font.name = "Segoe UI"
        p_h.space_after = Pt(1)

        p_b = tf_pdr.add_paragraph()
        p_b.text = b
        p_b.font.size = Pt(8.5)
        p_b.font.color.rgb = SLATE_BODY
        p_b.font.name = "Segoe UI"
        p_b.space_after = Pt(6)

    add_footer(s6, 6, 10)
    s6.notes_slide.notes_text_frame.text = (
        "This slide presents our Packet Delivery Ratio results plotted against configured network packet loss. "
        "Under 0% loss, both fixed and adaptive strategies achieve 100.00% PDR with zero variance. Under 10% loss, "
        "empirical PDR is approximately 90.4%, and under 25% loss, it is approximately 75.9%. Notice how closely "
        "the empirical curves follow the dashed theoretical (1 - p) boundary. Most importantly, the difference "
        "in PDR between fixed and adaptive transmission is less than 0.4% across all paired conditions. This provides "
        "empirical proof that accelerating transmission during clinical deterioration does not compromise link reliability."
    )

    # =========================================================================
    # SLIDE 7: THROUGHPUT SCALING & CONGESTION RESPONSE (Multi-Panel Comparison)
    # =========================================================================
    s7 = add_blank_slide()
    add_header(s7, "Benchmark Findings: Throughput & Scaling", "Throughput Dynamics: +32.7% Acuity Surge vs. 30% Congestion Throttle")

    # Left: Embed Throughput Chart
    chart_tput = "docs/images/throughput_comparison.png"
    if os.path.exists(chart_tput):
        s7.shapes.add_picture(chart_tput, Inches(0.8), Inches(1.6), Inches(5.6), Inches(4.8))

    # Right: Multi-Loss Throughput Comparison Matrix & Insights
    r7_bg = s7.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(6.7), Inches(1.6), Inches(5.833), Inches(4.8))
    r7_bg.fill.solid()
    r7_bg.fill.fore_color.rgb = CARD_BG
    r7_bg.line.color.rgb = BORDER_LIGHT

    tb_t = s7.shapes.add_textbox(Inches(6.9), Inches(1.75), Inches(5.4), Inches(4.5))
    tf_t = tb_t.text_frame
    tf_t.word_wrap = True

    pt7 = tf_t.paragraphs[0]
    pt7.text = "Throughput Response Across All Impairment Conditions"
    pt7.font.size = Pt(12)
    pt7.font.bold = True
    pt7.font.color.rgb = CHARCOAL
    pt7.font.name = "Segoe UI"
    pt7.space_after = Pt(6)

    t_tiers = [
        ("1. Clear Channel Regime (0% Loss): Maximum Acuity Surge", SUCCESS_GREEN,
         "Adaptive strategy delivers an exact +32.7% throughput surge across all scales:\n"
         "• 10 Beds: 13.27 vs. 10.00 msg/s (+3.27 msg/s, +32.7%)\n"
         "• 25 Beds: 33.17 vs. 25.00 msg/s (+8.17 msg/s, +32.7%)\n"
         "• 50 Beds: 66.33 vs. 50.00 msg/s (+16.33 msg/s, +32.7%)\n"
         "Clinical Value: Triples vital temporal sampling density for deteriorating beds."),

        ("2. Moderate Impairment (10% Loss): Preserved Acuity Gain", COBALT,
         "Throughput remains +26.6% to +27.0% above fixed baseline:\n"
         "• 10 Beds: 11.48 vs. 9.04 msg/s (+27.0%)\n"
         "• 25 Beds: 28.69 vs. 22.61 msg/s (+26.9%)\n"
         "• 50 Beds: 57.34 vs. 45.28 msg/s (+26.6%)\n"
         "Channel headroom is sufficient to sustain vital acceleration."),

        ("3. Severe Congestion (25% Loss): Congestion Backoff Throttles Surge", ALERT_RED,
         "1.30x congestion backoff multiplier slows 80% stable nodes (1000ms -> 1300ms):\n"
         "• 10 Beds: 7.94 vs. 7.64 msg/s (+0.30 msg/s, +3.9% gain)\n"
         "• 25 Beds: 19.39 vs. 19.01 msg/s (+0.38 msg/s, +2.0% gain)\n"
         "• 50 Beds: 37.79 vs. 37.73 msg/s (+0.06 msg/s, +0.2% gain)\n"
         "Engineering Value: Damps throughput surge to ~0%, preventing queue collapse.")
    ]

    for h, col, b in t_tiers:
        p_h = tf_t.add_paragraph()
        p_h.text = f"•  {h}"
        p_h.font.size = Pt(9.5)
        p_h.font.bold = True
        p_h.font.color.rgb = col
        p_h.font.name = "Segoe UI"
        p_h.space_after = Pt(1)

        p_b = tf_t.add_paragraph()
        p_b.text = b
        p_b.font.size = Pt(8.3)
        p_b.font.color.rgb = SLATE_BODY
        p_b.font.name = "Segoe UI"
        p_b.space_after = Pt(5)

    add_footer(s7, 7, 10)
    s7.notes_slide.notes_text_frame.text = (
        "This slide illustrates channel ingest throughput as ward scale expands from 10 to 50 beds. Under clear channel "
        "conditions, adaptive transmission delivers exactly 32.7% higher throughput than the fixed baseline across all "
        "node scales. In a 50-bed ward, throughput increases from 50.0 to 66.33 messages per second, providing vital updates "
        "at high temporal resolution for deteriorating patients. However, look at what happens at 25% loss: the throughput surge "
        "is throttled down to only +0.2% at 50 nodes. Why? Because our congestion backoff mechanism automatically slowed down "
        "the 40 stable patients by 30%, conserving radio bandwidth and preventing network collapse while still prioritizing acute vitals."
    )

    # =========================================================================
    # SLIDE 8: LATENCY, AOI & ALERT SPEED (Structured 2-Panel Scientific Visual)
    # =========================================================================
    s8 = add_blank_slide()
    add_header(s8, "Benchmark Findings: Latency & Freshness", "Transport Latency & Freshness Bounded Sub-50ms Across Ward Scaling")

    chart_lat = "docs/images/latency_comparison.png"
    chart_alt = "docs/images/alert_delivery_comparison.png"
    if os.path.exists(chart_lat) and os.path.exists(chart_alt):
        s8.shapes.add_picture(chart_lat, Inches(0.8), Inches(1.6), Inches(4.3), Inches(3.6))
        s8.shapes.add_picture(chart_alt, Inches(5.3), Inches(1.6), Inches(4.3), Inches(3.6))

    # Right Card: Timing Metrics
    card8_bg = s8.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(9.8), Inches(1.6), Inches(2.733), Inches(5.2))
    card8_bg.fill.solid()
    card8_bg.fill.fore_color.rgb = CARD_BG
    card8_bg.line.color.rgb = BORDER_LIGHT

    tb_8 = s8.shapes.add_textbox(Inches(9.95), Inches(1.75), Inches(2.45), Inches(4.9))
    tf_8 = tb_8.text_frame
    tf_8.word_wrap = True

    p8 = tf_8.paragraphs[0]
    p8.text = "Timing & Freshness Summary"
    p8.font.size = Pt(11)
    p8.font.bold = True
    p8.font.color.rgb = CHARCOAL
    p8.font.name = "Segoe UI"
    p8.space_after = Pt(8)

    t_notes = [
        ("Transport Latency", "Mean latency bounded between 37ms and 40ms across all 36 conditions.\nP95 latency stays strictly between 42ms and 49ms."),
        ("Arrival Freshness (AoI)", "Arrival-instant AoI bounded under 50ms at 95th percentile across 10 to 50 beds, demonstrating real-time delivery."),
        ("Urgent Alert Delivery", "Mean alert delivery latency is 32ms to 40ms from deterioration trigger to central station decoding."),
        ("Concurrency Overhead", "At 50 nodes QoS 1, Node.js event-loop scheduling adds a minor +5 to +7ms P95 latency overhead processing 66.3 msg/s.")
    ]
    for h, b in t_notes:
        ph = tf_8.add_paragraph()
        ph.text = f"•  {h}"
        ph.font.size = Pt(9.2)
        ph.font.bold = True
        ph.font.color.rgb = DEEP_BLUE
        ph.font.name = "Segoe UI"
        ph.space_after = Pt(1)

        pb = tf_8.add_paragraph()
        pb.text = b
        pb.font.size = Pt(8.2)
        pb.font.color.rgb = SLATE_BODY
        pb.font.name = "Segoe UI"
        pb.space_after = Pt(6)

    # Bottom summary box spanning left side
    sbox = s8.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.8), Inches(5.4), Inches(8.8), Inches(1.4))
    sbox.fill.solid()
    sbox.fill.fore_color.rgb = CARD_BG
    sbox.line.color.rgb = BORDER_LIGHT

    stb = s8.shapes.add_textbox(Inches(0.95), Inches(5.45), Inches(8.5), Inches(1.3))
    stf = stb.text_frame
    stf.word_wrap = True
    sp1 = stf.paragraphs[0]
    sp1.text = "Verification Metrics: Zero Buffer Drops & Sub-50ms Transport Compliance"
    sp1.font.size = Pt(9.5)
    sp1.font.bold = True
    sp1.font.color.rgb = SUCCESS_GREEN
    sp1.space_after = Pt(2)
    sp2 = stf.add_paragraph()
    sp2.text = (
        "• Offline Ring Buffer: Exactly 0 buffer drops across all 108 runs; 100-frame capacity safely absorbs short disconnections.\n"
        "• Alert Latency Integrity: Patched legacy 1-2ms in-flight artifacts in 50-node seed 202, confirming true condition means of 35-38ms.\n"
        "• Clinical Viability: Telemetry reaches nursing desk well within the standard 250ms critical medical response threshold."
    )
    sp2.font.size = Pt(8.2)
    sp2.font.color.rgb = SLATE_BODY

    add_footer(s8, 8, 10)
    s8.notes_slide.notes_text_frame.text = (
        "This slide presents our latency, freshness, and alert speed results. On the left, P95 transport latency is plotted "
        "under 25% loss across ward scales: it remains strictly between 42ms and 49ms. In the center, mean alert delivery latency "
        "is plotted across loss levels: it consistently stabilizes between 32ms and 40ms. Our offline client ring buffers experienced "
        "zero overflows across all 108 runs. We did observe a minor 5 to 7 millisecond latency increase at 50 nodes under adaptive "
        "QoS 1, which represents Node.js single-threaded event loop queuing when processing 66 messages per second. Overall, all vital "
        "updates and alerts arrive well within clinical sub-second safety thresholds."
    )

    # =========================================================================
    # SLIDE 9: ARCHITECTURAL INSIGHTS & THREATS TO VALIDITY
    # =========================================================================
    s9 = add_blank_slide()
    add_header(s9, "Critical Analysis & Limitations", "Architectural Insights & Threats to Validity")

    c_w = Inches(5.6)
    c_h = Inches(2.3)
    
    insights = [
        ("1. Pre-Publication Loss & QoS 0/1 Equivalence", ALERT_RED, Inches(0.8), Inches(1.6),
         "Observation: QoS 0 and QoS 1 show virtually identical PDR (~90.4% at 10% loss; ~75.5% at 25% loss).\n"
         "Causal Explanation: Packet loss is injected in userland software within NetworkEmulator before mqttClient.publish() is called. Surviving frames travel over local loopback TCP (127.0.0.1) where TCP delivers 100% reliably. Dropped packets never enter the network stack, so QoS 1 PUBACK retransmission is never triggered across physical lossy RF."),

        ("2. Arrival-Instant AoI vs. Continuous Peak AoI", COBALT, Inches(6.93), Inches(1.6),
         "Observation: Reported AoI averages ~38ms, tracking transport latency.\n"
         "Causal Explanation: The reported metric evaluates data age at arrival instant (t_recv - t_gen), reflecting delivery freshness of successful packets. It does not measure continuous time-integral or Peak AoI (PAoI), which would grow linearly to 1000-2000ms during drop gaps. Continuous PAoI tracking is documented as future work."),

        ("3. Host Event-Loop & Timer Resolution Jitter", CHARCOAL, Inches(0.8), Inches(4.1),
         "Observation: Mean latency is 37-40ms despite a configured 30ms emulator delay.\n"
         "Causal Explanation: The additional 7-10ms overhead arises from Node.js event-loop timer scheduling (setTimeout), JSON serialization/deserialization, and asynchronous microtask queuing on a single shared host running all 50 virtual nodes simultaneously."),

        ("4. Deterministic Simulation vs. Stochastic Wireless RF", SLATE_BODY, Inches(6.93), Inches(4.1),
         "Observation: Low PDR variance (sigma <= 1.96%) across 3 random seeds.\n"
         "Causal Explanation: Three seeds confirm deterministic software execution and logic correctness across 108 runs. However, physical wireless channels require wider Monte Carlo sweeps (10-30 seeds) on physical hardware to model 802.11 CSMA/CA collisions, multipath fading, and hidden-node interference.")
    ]

    for title, col, x, y, desc in insights:
        ibg = s9.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, x, y, c_w, c_h)
        ibg.fill.solid()
        ibg.fill.fore_color.rgb = CARD_BG
        ibg.line.color.rgb = BORDER_LIGHT

        st = s9.shapes.add_shape(MSO_SHAPE.RECTANGLE, x, y, Inches(0.08), c_h)
        st.fill.solid()
        st.fill.fore_color.rgb = col
        st.line.fill.background()

        itb = s9.shapes.add_textbox(x + Inches(0.2), y + Inches(0.12), c_w - Inches(0.35), c_h - Inches(0.25))
        itf = itb.text_frame
        itf.word_wrap = True

        pi = itf.paragraphs[0]
        pi.text = title
        pi.font.size = Pt(10.5)
        pi.font.bold = True
        pi.font.color.rgb = CHARCOAL
        pi.font.name = "Segoe UI"
        pi.space_after = Pt(3)

        pd = itf.add_paragraph()
        pd.text = desc
        pd.font.size = Pt(8.5)
        pd.font.color.rgb = SLATE_BODY
        pd.font.name = "Segoe UI"

    add_footer(s9, 9, 10)
    s9.notes_slide.notes_text_frame.text = (
        "An examiner reviewing our data will ask why MQTT QoS 1 shows no PDR advantage over QoS 0. We must be scientifically "
        "honest about why. In our simulation, packet loss is injected in userland software before packets reach the MQTT client. "
        "Packets that survive travel over a local loopback TCP connection, which has zero packet loss. Because dropped packets "
        "never enter the network socket, QoS 1 never triggers retransmission. This setup validates application resilience and "
        "deduplication, but does not evaluate transport retransmissions over lossy RF links. Similarly, our reported AoI evaluates "
        "arrival-instant freshness rather than continuous peak AoI. Transparently acknowledging these limitations demonstrates "
        "technical rigor and defense readiness."
    )

    # =========================================================================
    # SLIDE 10: CONCLUSION & FUTURE WORK
    # =========================================================================
    s10 = add_blank_slide()
    add_header(s10, "Summary & Future Roadmap", "Verified Conclusions & Future Wireless Telemetry Roadmap")

    col_w = Inches(5.6)
    col_h = Inches(4.8)
    col_y = Inches(1.6)

    # Left: Conclusions
    c_bg = s10.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.8), col_y, col_w, col_h)
    c_bg.fill.solid()
    c_bg.fill.fore_color.rgb = CARD_BG
    c_bg.line.color.rgb = BORDER_LIGHT

    tb_c = s10.shapes.add_textbox(Inches(1.05), col_y + Inches(0.18), col_w - Inches(0.5), col_h - Inches(0.35))
    tf_c = tb_c.text_frame
    tf_c.word_wrap = True

    pc = tf_c.paragraphs[0]
    pc.text = "Verified Conclusions & Achievements"
    pc.font.size = Pt(12)
    pc.font.bold = True
    pc.font.color.rgb = CHARCOAL
    pc.font.name = "Segoe UI"
    pc.space_after = Pt(8)

    concls = [
        ("Rigorous Measurement Pipeline Verified", SUCCESS_GREEN,
         "Corrected legacy denominator miscounting and sequence gap logic, achieving exact theoretical PDR alignment (100% at 0%, 90.4% at 10%, 75.9% at 25% loss)."),
        ("Acuity-Adaptive Pacing Proved Effective", COBALT,
         "Delivers +32.7% more telemetry to deteriorating patients on clear channels while automatically throttling baseline traffic by 30% under severe 25% loss to preserve network integrity."),
        ("Sub-50ms Transport & Rapid Alerting", DEEP_BLUE,
         "Maintained sub-50ms P95 latency and 32-40ms alert delivery times across 10 to 50 concurrent ICU beds with zero offline buffer overflows."),
        ("Full-Stack Open-Source Artifact", CHARCOAL,
         "Complete monorepo with 156 passed unit tests, Next.js 14 dashboard, Prisma database ingest, and automated benchmark runner.")
    ]
    for h, col, b in concls:
        p_h = tf_c.add_paragraph()
        p_h.text = f"•  {h}"
        p_h.font.size = Pt(9.5)
        p_h.font.bold = True
        p_h.font.color.rgb = col
        p_h.font.name = "Segoe UI"
        p_h.space_after = Pt(1)

        p_b = tf_c.add_paragraph()
        p_b.text = b
        p_b.font.size = Pt(8.5)
        p_b.font.color.rgb = SLATE_BODY
        p_b.font.name = "Segoe UI"
        p_b.space_after = Pt(6)

    # Right: Future Roadmap
    f_bg = s10.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(6.93), col_y, col_w, col_h)
    f_bg.fill.solid()
    f_bg.fill.fore_color.rgb = CARD_BG
    f_bg.line.color.rgb = BORDER_LIGHT

    tb_f = s10.shapes.add_textbox(Inches(7.18), col_y + Inches(0.18), col_w - Inches(0.5), col_h - Inches(0.35))
    tf_f = tb_f.text_frame
    tf_f.word_wrap = True

    pf = tf_f.paragraphs[0]
    pf.text = "Future Work & Research Roadmap"
    pf.font.size = Pt(12)
    pf.font.bold = True
    pf.font.color.rgb = CHARCOAL
    pf.font.name = "Segoe UI"
    pf.space_after = Pt(8)

    future = [
        ("Phase 1: Physical Wireless Hardware Testbed",
         "Deploy bedside telemetry clients onto distributed single-board computers (ESP32 / Raspberry Pi) over physical IEEE 802.11 Wi-Fi and 802.15.4 Zigbee mesh networks to evaluate true RF interference and contention."),
        ("Phase 2: Kernel-Level Traffic Shaping (tc-netem)",
         "Integrate Linux kernel `tc-netem` on raw TCP sockets to simulate genuine transport packet drops and evaluate true MQTT QoS 1 PUBACK retransmission behavior."),
        ("Phase 3: Continuous Peak Age of Information (PAoI)",
         "Implement continuous time-integral accumulators at the central subscriber to evaluate telemetry staleness during prolonged radio blackouts."),
        ("Phase 4: Multi-Broker Clustering & Clinical Validation",
         "Deploy clustered Mosquitto / EMQX brokers with HAProxy load balancing to scale beyond 500 beds, and calibrate vitals against clinical PhysioNet MIMIC-IV ICU recordings.")
    ]
    for h, b in future:
        p_h = tf_f.add_paragraph()
        p_h.text = f"•  {h}"
        p_h.font.size = Pt(9.5)
        p_h.font.bold = True
        p_h.font.color.rgb = DEEP_BLUE
        p_h.font.name = "Segoe UI"
        p_h.space_after = Pt(1)

        p_b = tf_f.add_paragraph()
        p_b.text = b
        p_b.font.size = Pt(8.5)
        p_b.font.color.rgb = SLATE_BODY
        p_b.font.name = "Segoe UI"
        p_b.space_after = Pt(6)

    add_footer(s10, 10, 10)
    s10.notes_slide.notes_text_frame.text = (
        "In conclusion, the WiCare project demonstrates a resilient, acuity-adaptive wireless ICU telemetry architecture "
        "validated through a rigorous 108-run empirical simulation pipeline. We proved that acuity-adaptive pacing successfully "
        "allocates extra bandwidth to unstable patients (+32.7% throughput) while automatically engaging congestion backoff "
        "under severe loss to prevent network collapse. We confirmed sub-50ms latency and 32 to 40ms alert delivery times across "
        "scaling up to 50 concurrent ICU beds. Looking forward, our roadmap outlines deploying onto physical ESP32 and Raspberry Pi "
        "hardware, using Linux NetEm for kernel-level socket impairment, tracking continuous Peak Age of Information, and validating "
        "against real ICU patient datasets. Thank you for your attention, and I am now ready to take your questions."
    )

    # Save Presentation
    prs.save(output_path)
    print(f"Repaired Presentation saved successfully to: {os.path.abspath(output_path)}")

if __name__ == "__main__":
    out = "WiCare_WMC_Presentation_Repaired.pptx"
    if len(sys.argv) > 1:
        out = sys.argv[1]
    build_repaired_deck(out)
