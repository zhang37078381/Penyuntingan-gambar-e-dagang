/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Modality, GenerateContentResponse } from "@google/genai";

type Tab = 'text-to-image' | 'image-to-image' | 'image-edit' | 'image-compose';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });

interface ImageFile {
  base64: string;
  mimeType: string;
}

const fileToGenerativePart = async (file: File): Promise<ImageFile> => {
  const base64encodedData = await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
    reader.readAsDataURL(file);
  });
  return {
    base64: base64encodedData,
    mimeType: file.type,
  };
};

const translateToEnglish = async (text: string): Promise<string> => {
    if (!text.trim()) {
        return "";
    }
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `Translate the following Chinese text to English. Return only the translated English text, without any explanation or extra text.

            Chinese text: "${text}"`,
            config: {
                temperature: 0, 
            }
        });
        return response.text.trim();
    } catch (error) {
        console.error("Translation failed:", error);
        // Fallback to original text if translation fails
        return text;
    }
};


const Loader = () => <div className="loader" aria-label="Loading..."></div>;

const DownloadButton = ({ imageUrl, filename = 'generated-image.png' }: { imageUrl: string; filename?: string; }) => {
    const handleDownload = () => {
        const link = document.createElement('a');
        link.href = imageUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <button onClick={handleDownload} className="download-btn" aria-label="Download image" title="Download image">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        </button>
    );
};

const ImageUploader = ({ onFilesSelect, multiple = false, promptText }: { onFilesSelect: (files: File[]) => void; multiple?: boolean; promptText: string; }) => {
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      onFilesSelect(Array.from(e.target.files));
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files) {
      onFilesSelect(Array.from(e.dataTransfer.files));
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <label className="image-uploader" onDrop={handleDrop} onDragOver={handleDragOver}>
      <p>{promptText}</p>
      <input type="file" accept="image/*" onChange={handleFileChange} multiple={multiple} style={{ display: 'none' }} />
    </label>
  );
};


const TextToImage = () => {
    const [prompt, setPrompt] = useState('');
    const [batchCount, setBatchCount] = useState(1);
    const [loading, setLoading] = useState(false);
    const [results, setResults] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async () => {
        if (!prompt) {
            setError('请输入提示词');
            return;
        }
        setLoading(true);
        setError(null);
        setResults([]);

        try {
            const translatedPrompt = await translateToEnglish(prompt);
            const response = await ai.models.generateImages({
                model: 'imagen-4.0-generate-001',
                prompt: translatedPrompt,
                config: { numberOfImages: batchCount, outputMimeType: 'image/png' },
            });
            const imageUrls = response.generatedImages.map(img => `data:image/png;base64,${img.image.imageBytes}`);
            setResults(imageUrls);
        } catch (e: any) {
            setError(e.message || '生成图片时发生错误');
        } finally {
            setLoading(false);
        }
    };
    
    return (
        <div className="panel-container">
            <div className="input-panel">
                <h2>文生图</h2>
                <div className="form-group">
                    <label htmlFor="text-prompt">提示词</label>
                    <textarea id="text-prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="输入详细的商品描述，例如：'一个红色丝绸背景下的高端护肤品瓶子，光线柔和'" />
                </div>
                <div className="form-group">
                    <label htmlFor="text-batch-count">生成数量</label>
                    <input
                        id="text-batch-count"
                        type="number"
                        value={batchCount}
                        onChange={(e) => setBatchCount(Math.max(1, Math.min(4, parseInt(e.target.value, 10) || 1)))}
                        min="1"
                        max="4"
                    />
                </div>
                <button className="btn" onClick={handleSubmit} disabled={loading || !prompt}>
                    {loading ? <Loader/> : '生成图片'}
                </button>
                {error && <p className="error-message">{error}</p>}
            </div>
            <div className="output-panel">
                <h2>生成结果</h2>
                <div className="placeholder">
                    {loading && <Loader />}
                    {!loading && results.length > 0 && (
                        <div className="result-grid">
                            {results.map((src, index) => (
                                <div key={index} className="result-item">
                                    <img src={src} alt={`Generated image ${index + 1}`} />
                                    <DownloadButton imageUrl={src} filename={`generated-image-${index + 1}.png`} />
                                </div>
                            ))}
                        </div>
                    )}
                    {!loading && results.length === 0 && <p>生成的图片将显示在这里</p>}
                </div>
            </div>
        </div>
    );
};

const ImageProcessor = ({ mode }: { mode: 'image-to-image' | 'image-edit' | 'image-compose' }) => {
    const [prompt, setPrompt] = useState('');
    const [files, setFiles] = useState<File[]>([]);
    const [batchCount, setBatchCount] = useState(1);
    const [loading, setLoading] = useState(false);
    const [results, setResults] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);

    const { title, promptLabel, promptPlaceholder, uploaderPrompt, buttonText, multipleFiles } = useMemo(() => {
        switch (mode) {
            case 'image-to-image':
                return {
                    title: '图生图',
                    promptLabel: '（可选）修改指令',
                    promptPlaceholder: '输入您想如何改变图片，例如：\'改变背景为沙滩\'',
                    uploaderPrompt: '点击或拖拽图片到这里',
                    buttonText: '生成相似图',
                    multipleFiles: false,
                };
            case 'image-edit':
                return {
                    title: '图片编辑',
                    promptLabel: '编辑指令',
                    promptPlaceholder: '输入编辑指令，例如：\'移除背景\' 或 \'在商品旁边添加一个礼品盒\'',
                    uploaderPrompt: '点击或拖拽要编辑的图片到这里',
                    buttonText: '开始编辑',
                    multipleFiles: false,
                };
            case 'image-compose':
                return {
                    title: '图片合成',
                    promptLabel: '合成指令',
                    promptPlaceholder: '描述您希望如何合成这些图片，例如：\'将第一个图的商品放在第二个图的背景上\'',
                    uploaderPrompt: '点击或拖拽多张图片到这里',
                    buttonText: '开始合成',
                    multipleFiles: true,
                };
        }
    }, [mode]);

    const handleFilesSelect = (selectedFiles: File[]) => {
        setFiles(multipleFiles ? [...files, ...selectedFiles] : [selectedFiles[0]]);
    };
    
    const handleRemoveFile = (indexToRemove: number) => {
        setFiles(files.filter((_, index) => index !== indexToRemove));
    };

    const handleSubmit = async () => {
        if (files.length === 0) {
            setError('请上传至少一张图片');
            return;
        }
        if (!prompt && (mode === 'image-edit' || mode === 'image-compose')) {
            setError('请输入指令');
            return;
        }

        setLoading(true);
        setError(null);
        setResults([]);

        try {
            const translatedPrompt = await translateToEnglish(prompt);
            const imageParts = await Promise.all(files.map(fileToGenerativePart));
            
            const contents = {
                parts: [
                    ...imageParts.map(part => ({
                        inlineData: { data: part.base64, mimeType: part.mimeType },
                    })),
                    { text: translatedPrompt },
                ],
            };

            const modelConfig = {
                model: 'gemini-2.5-flash-image-preview',
                contents: contents,
                config: {
                    responseModalities: [Modality.IMAGE, Modality.TEXT],
                },
            };

            if (mode === 'image-compose' || mode === 'image-to-image') {
                const promises = Array.from({ length: batchCount }, () => ai.models.generateContent(modelConfig));
                const responses = await Promise.all(promises);
                const imageUrls = responses.map(response => {
                    const imagePart = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
                    if (imagePart?.inlineData) {
                        return `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`;
                    }
                    return null;
                }).filter((url): url is string => url !== null);

                if (imageUrls.length === 0) {
                    throw new Error('所有图片生成均失败');
                }
                setResults(imageUrls);

            } else {
                const response: GenerateContentResponse = await ai.models.generateContent(modelConfig);
                const imagePart = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
                if (imagePart?.inlineData) {
                    setResults([`data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`]);
                } else {
                    throw new Error('未能在响应中找到图片');
                }
            }

        } catch (e: any) {
            setError(e.message || '处理图片时发生错误');
        } finally {
            setLoading(false);
        }
    };

    const isButtonDisabled = loading || files.length === 0 || (!prompt && (mode === 'image-edit' || mode === 'image-compose'));
    
    return (
        <div className="panel-container">
            <div className="input-panel">
                <h2>{title}</h2>
                <div className="form-group">
                    <label>上传图片</label>
                    <ImageUploader onFilesSelect={handleFilesSelect} multiple={multipleFiles} promptText={uploaderPrompt} />
                    {files.length > 0 && (
                        <div className="preview-grid">
                            {files.map((file, index) => (
                                <div key={index} className="preview-item">
                                    <img src={URL.createObjectURL(file)} alt={`Preview ${index + 1}`} />
                                    <button className="close-btn" onClick={() => handleRemoveFile(index)} aria-label={`Remove image ${index + 1}`}>&times;</button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                 <div className="form-group">
                    <label htmlFor="image-prompt">{promptLabel}</label>
                    <textarea id="image-prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={promptPlaceholder} />
                </div>
                {(mode === 'image-compose' || mode === 'image-to-image') && (
                    <div className="form-group">
                        <label htmlFor="batch-count">生成数量</label>
                        <input
                            id="batch-count"
                            type="number"
                            value={batchCount}
                            onChange={(e) => setBatchCount(Math.max(1, Math.min(4, parseInt(e.target.value, 10) || 1)))}
                            min="1"
                            max="4"
                        />
                    </div>
                )}
                <button className="btn" onClick={handleSubmit} disabled={isButtonDisabled}>
                    {loading ? <Loader/> : buttonText}
                </button>
                {error && <p className="error-message">{error}</p>}
            </div>
            <div className="output-panel">
                <h2>生成结果</h2>
                <div className="placeholder">
                    {loading && <Loader />}
                    {!loading && results.length > 0 && (
                        <div className="result-grid">
                           {results.map((src, index) => (
                                <div key={index} className="result-item">
                                    <img src={src} alt={`Processed image ${index + 1}`} />
                                    <DownloadButton imageUrl={src} filename={`processed-image-${index + 1}.png`} />
                                </div>
                           ))}
                        </div>
                    )}
                    {!loading && results.length === 0 && <p>处理后的图片将显示在这里</p>}
                </div>
            </div>
        </div>
    )
};


const App = () => {
  const [activeTab, setActiveTab] = useState<Tab>('text-to-image');

  const renderContent = () => {
    switch (activeTab) {
      case 'text-to-image':
        return <TextToImage />;
      case 'image-to-image':
        return <ImageProcessor mode="image-to-image" />;
      case 'image-edit':
        return <ImageProcessor mode="image-edit" />;
      case 'image-compose':
        return <ImageProcessor mode="image-compose" />;
      default:
        return null;
    }
  };

  return (
    <div className="app-container">
      <header>
        <h1>电商图片处理</h1>
      </header>
      <nav>
        <button className={activeTab === 'text-to-image' ? 'active' : ''} onClick={() => setActiveTab('text-to-image')}>文生图</button>
        <button className={activeTab === 'image-to-image' ? 'active' : ''} onClick={() => setActiveTab('image-to-image')}>图生图</button>
        <button className={activeTab === 'image-edit' ? 'active' : ''} onClick={() => setActiveTab('image-edit')}>图片编辑</button>
        <button className={activeTab === 'image-compose' ? 'active' : ''} onClick={() => setActiveTab('image-compose')}>图片合成</button>
      </nav>
      <main>
        {renderContent()}
      </main>
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);