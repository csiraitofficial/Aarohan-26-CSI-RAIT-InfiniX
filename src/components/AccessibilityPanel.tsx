import { useState, useEffect, createContext, useContext } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import {
    Accessibility,
    Eye,
    Type,
    Volume2,
    VolumeX,
    Sun,
    Moon,
    Settings2,
    X
} from 'lucide-react';

// Accessibility Context
interface AccessibilitySettings {
    fontSize: 'normal' | 'large' | 'extra-large';
    highContrast: boolean;
    audioEnabled: boolean;
    reducedMotion: boolean;
}

interface AccessibilityContextType {
    settings: AccessibilitySettings;
    updateSettings: (settings: Partial<AccessibilitySettings>) => void;
    speak: (text: string, priority?: 'polite' | 'assertive') => void;
}

const defaultSettings: AccessibilitySettings = {
    fontSize: 'normal',
    highContrast: false,
    audioEnabled: false,
    reducedMotion: false,
};

const AccessibilityContext = createContext<AccessibilityContextType | null>(null);

export const useAccessibility = () => {
    const context = useContext(AccessibilityContext);
    if (!context) {
        throw new Error('useAccessibility must be used within AccessibilityProvider');
    }
    return context;
};

// Text-to-Speech helper
const speak = (text: string, priority: 'polite' | 'assertive' = 'polite') => {
    if ('speechSynthesis' in window) {
        // Cancel any ongoing speech
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'en-IN'; // Indian English
        utterance.rate = 0.9;
        utterance.pitch = 1;

        // Try to use an Indian English voice if available
        const voices = window.speechSynthesis.getVoices();
        const indianVoice = voices.find(v => v.lang.includes('en-IN')) ||
            voices.find(v => v.lang.includes('en'));
        if (indianVoice) {
            utterance.voice = indianVoice;
        }

        window.speechSynthesis.speak(utterance);
    }
};

// Provider Component
export const AccessibilityProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [settings, setSettings] = useState<AccessibilitySettings>(() => {
        const saved = localStorage.getItem('yatayat-accessibility');
        return saved ? JSON.parse(saved) : defaultSettings;
    });

    // Apply settings to document
    useEffect(() => {
        const root = document.documentElement;

        // Font size
        root.classList.remove('font-normal', 'font-large', 'font-extra-large');
        root.classList.add(`font-${settings.fontSize}`);

        // High contrast
        if (settings.highContrast) {
            root.classList.add('high-contrast');
        } else {
            root.classList.remove('high-contrast');
        }

        // Reduced motion
        if (settings.reducedMotion) {
            root.classList.add('reduce-motion');
        } else {
            root.classList.remove('reduce-motion');
        }

        // Save to localStorage
        localStorage.setItem('yatayat-accessibility', JSON.stringify(settings));
    }, [settings]);

    const updateSettings = (newSettings: Partial<AccessibilitySettings>) => {
        setSettings(prev => ({ ...prev, ...newSettings }));
    };

    const contextSpeak = (text: string, priority: 'polite' | 'assertive' = 'polite') => {
        if (settings.audioEnabled) {
            speak(text, priority);
        }
    };

    return (
        <AccessibilityContext.Provider value={{ settings, updateSettings, speak: contextSpeak }}>
            {children}
        </AccessibilityContext.Provider>
    );
};

// Accessibility Panel Component
export const AccessibilityPanel: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const { settings, updateSettings, speak } = useAccessibility();

    const fontSizes = [
        { value: 'normal', label: 'Normal', size: '16px' },
        { value: 'large', label: 'Large', size: '18px' },
        { value: 'extra-large', label: 'Extra Large', size: '22px' },
    ] as const;

    const togglePanel = () => {
        setIsOpen(!isOpen);
        if (settings.audioEnabled && !isOpen) {
            speak('Accessibility settings opened');
        }
    };

    return (
        <>
            {/* Floating Accessibility Button */}
            <button
                onClick={togglePanel}
                className="fixed bottom-4 right-4 z-50 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:scale-110 transition-transform flex items-center justify-center"
                aria-label="Open accessibility settings"
                title="Accessibility Options"
            >
                <Accessibility className="w-6 h-6" />
            </button>

            {/* Settings Panel */}
            {isOpen && (
                <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setIsOpen(false)}>
                    <Card
                        className="w-full max-w-md bg-background p-6 shadow-2xl"
                        onClick={e => e.stopPropagation()}
                        role="dialog"
                        aria-label="Accessibility Settings"
                    >
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <Accessibility className="w-6 h-6 text-primary" />
                                <h2 className="text-xl font-bold">Accessibility Options</h2>
                            </div>
                            <button
                                onClick={() => setIsOpen(false)}
                                className="p-2 hover:bg-muted rounded-lg"
                                aria-label="Close settings"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="space-y-6">
                            {/* Font Size */}
                            <div className="space-y-3">
                                <div className="flex items-center gap-2">
                                    <Type className="w-5 h-5 text-muted-foreground" />
                                    <Label className="text-base font-medium">Text Size</Label>
                                </div>
                                <div className="grid grid-cols-3 gap-2">
                                    {fontSizes.map(({ value, label, size }) => (
                                        <button
                                            key={value}
                                            onClick={() => {
                                                updateSettings({ fontSize: value });
                                                speak(`Text size set to ${label}`);
                                            }}
                                            className={`p-3 rounded-lg border-2 transition-all ${settings.fontSize === value
                                                    ? 'border-primary bg-primary/10 text-primary'
                                                    : 'border-border hover:border-primary/50'
                                                }`}
                                            style={{ fontSize: size }}
                                            aria-pressed={settings.fontSize === value}
                                        >
                                            {label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* High Contrast */}
                            <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                                <div className="flex items-center gap-3">
                                    <Eye className="w-5 h-5 text-muted-foreground" />
                                    <div>
                                        <Label className="text-base font-medium">High Contrast</Label>
                                        <p className="text-sm text-muted-foreground">Increases visual clarity</p>
                                    </div>
                                </div>
                                <Switch
                                    checked={settings.highContrast}
                                    onCheckedChange={(checked) => {
                                        updateSettings({ highContrast: checked });
                                        speak(checked ? 'High contrast enabled' : 'High contrast disabled');
                                    }}
                                    aria-label="Toggle high contrast mode"
                                />
                            </div>

                            {/* Audio Descriptions */}
                            <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                                <div className="flex items-center gap-3">
                                    {settings.audioEnabled ? (
                                        <Volume2 className="w-5 h-5 text-primary" />
                                    ) : (
                                        <VolumeX className="w-5 h-5 text-muted-foreground" />
                                    )}
                                    <div>
                                        <Label className="text-base font-medium">Audio Descriptions</Label>
                                        <p className="text-sm text-muted-foreground">Read screen content aloud</p>
                                    </div>
                                </div>
                                <Switch
                                    checked={settings.audioEnabled}
                                    onCheckedChange={(checked) => {
                                        updateSettings({ audioEnabled: checked });
                                        if (checked) {
                                            // Immediate feedback when enabling
                                            speak('Audio descriptions enabled. I will read important information aloud.');
                                        }
                                    }}
                                    aria-label="Toggle audio descriptions"
                                />
                            </div>

                            {/* Reduced Motion */}
                            <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                                <div className="flex items-center gap-3">
                                    <Settings2 className="w-5 h-5 text-muted-foreground" />
                                    <div>
                                        <Label className="text-base font-medium">Reduced Motion</Label>
                                        <p className="text-sm text-muted-foreground">Minimize animations</p>
                                    </div>
                                </div>
                                <Switch
                                    checked={settings.reducedMotion}
                                    onCheckedChange={(checked) => {
                                        updateSettings({ reducedMotion: checked });
                                        speak(checked ? 'Animations reduced' : 'Animations enabled');
                                    }}
                                    aria-label="Toggle reduced motion"
                                />
                            </div>

                            {/* Test Audio Button */}
                            {settings.audioEnabled && (
                                <Button
                                    onClick={() => speak('Audio is working correctly. I will announce important traffic alerts and notifications.')}
                                    className="w-full"
                                    variant="outline"
                                >
                                    <Volume2 className="w-4 h-4 mr-2" />
                                    Test Audio
                                </Button>
                            )}

                            {/* Reset Button */}
                            <Button
                                onClick={() => {
                                    updateSettings(defaultSettings);
                                    speak('Settings reset to defaults');
                                }}
                                variant="ghost"
                                className="w-full text-muted-foreground"
                            >
                                Reset to Defaults
                            </Button>
                        </div>

                        {/* Keyboard Shortcut Hint */}
                        <p className="mt-4 text-xs text-center text-muted-foreground">
                            Press <kbd className="px-1 py-0.5 bg-muted rounded text-xs">Alt + A</kbd> to open accessibility settings
                        </p>
                    </Card>
                </div>
            )}
        </>
    );
};

// Hook for components to announce content
export const useAnnounce = () => {
    const { settings, speak } = useAccessibility();

    return {
        announce: (text: string, priority: 'polite' | 'assertive' = 'polite') => {
            if (settings.audioEnabled) {
                speak(text, priority);
            }
        },
        isAudioEnabled: settings.audioEnabled,
    };
};

export default AccessibilityPanel;
