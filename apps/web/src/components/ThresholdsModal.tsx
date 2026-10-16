'use client';

import React, { useEffect, useState } from 'react';
import type { AlertThresholdItem } from '../lib/api';
import { fetchThresholds, updateThreshold } from '../lib/api';
import { X, Sliders, Save, Check } from 'lucide-react';

interface ThresholdsModalProps {
  onClose: () => void;
}

export const ThresholdsModal: React.FC<ThresholdsModalProps> = ({ onClose }) => {
  const [thresholds, setThresholds] = useState<AlertThresholdItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingMap, setSavingMap] = useState<Record<string, boolean>>({});
  const [savedMap, setSavedMap] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetchThresholds()
      .then((res) => {
        setThresholds(res.thresholds);
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  const handleChange = (measurement: string, field: keyof AlertThresholdItem, val: string) => {
    const num = val === '' ? null : parseFloat(val);
    setThresholds((prev) =>
      prev.map((t) => (t.measurement === measurement ? { ...t, [field]: num } : t))
    );
  };

  const handleSave = async (item: AlertThresholdItem) => {
    setSavingMap((prev) => ({ ...prev, [item.measurement]: true }));
    try {
      const res = await updateThreshold(item.measurement, {
        minWarning: item.minWarning,
        maxWarning: item.maxWarning,
        minCritical: item.minCritical,
        maxCritical: item.maxCritical,
        unit: item.unit,
      });
      if (res.success) {
        setSavedMap((prev) => ({ ...prev, [item.measurement]: true }));
        setTimeout(() => {
          setSavedMap((prev) => ({ ...prev, [item.measurement]: false }));
        }, 2000);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSavingMap((prev) => ({ ...prev, [item.measurement]: false }));
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content thresholds-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>
              <Sliders size={20} style={{ display: 'inline', marginRight: '8px' }} color="#3b82f6" />
              Clinical Alert Threshold Configurations
            </h2>
            <p className="modal-subtitle">Customize warning and critical boundary triggers stored in DB</p>
          </div>
          <button className="btn-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {loading ? (
          <div className="loading-spinner">Loading thresholds...</div>
        ) : (
          <div className="thresholds-table">
            <div className="threshold-row header-row">
              <span>Measurement</span>
              <span>Min Warning</span>
              <span>Max Warning</span>
              <span>Min Critical</span>
              <span>Max Critical</span>
              <span>Unit</span>
              <span>Action</span>
            </div>

            {thresholds.map((t) => (
              <div key={t.measurement} className="threshold-row">
                <span className="measurement-name mono">{t.measurement}</span>

                <input
                  type="number"
                  step="any"
                  value={t.minWarning ?? ''}
                  onChange={(e) => handleChange(t.measurement, 'minWarning', e.target.value)}
                  placeholder="None"
                  className="threshold-input"
                />

                <input
                  type="number"
                  step="any"
                  value={t.maxWarning ?? ''}
                  onChange={(e) => handleChange(t.measurement, 'maxWarning', e.target.value)}
                  placeholder="None"
                  className="threshold-input"
                />

                <input
                  type="number"
                  step="any"
                  value={t.minCritical ?? ''}
                  onChange={(e) => handleChange(t.measurement, 'minCritical', e.target.value)}
                  placeholder="None"
                  className="threshold-input critical-input"
                />

                <input
                  type="number"
                  step="any"
                  value={t.maxCritical ?? ''}
                  onChange={(e) => handleChange(t.measurement, 'maxCritical', e.target.value)}
                  placeholder="None"
                  className="threshold-input critical-input"
                />

                <span className="unit-label mono">{t.unit}</span>

                <button
                  className={`btn-save-threshold ${savedMap[t.measurement] ? 'saved' : ''}`}
                  onClick={() => handleSave(t)}
                  disabled={savingMap[t.measurement]}
                >
                  {savedMap[t.measurement] ? (
                    <>
                      <Check size={14} /> Saved
                    </>
                  ) : (
                    <>
                      <Save size={14} /> Save
                    </>
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
