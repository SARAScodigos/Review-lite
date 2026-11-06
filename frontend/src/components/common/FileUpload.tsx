import React, { useRef, useState } from 'react';
import { UploadCloud, File, Image as ImageIcon, X, CheckCircle2 } from 'lucide-react';

interface FileUploadProps {
  label?: string;
  hint?: string;
  accept?: string;
  selectedFile: File | null;
  onFileSelect: (file: File | null) => void;
  currentFileUrl?: string | null;
  disabled?: boolean;
}

export const FileUpload: React.FC<FileUploadProps> = ({
  label = 'Subir Archivo',
  hint = 'Arrastra un archivo aquí o haz clic para seleccionar',
  accept = 'image/*,application/pdf',
  selectedFile,
  onFileSelect,
  currentFileUrl,
  disabled = false,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      onFileSelect(file);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      onFileSelect(file);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const isImage = (file: File) => file.type.startsWith('image/');

  return (
    <div className="space-y-1.5">
      {label && (
        <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
          {label}
        </label>
      )}

      {/* Dropzone Container */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !disabled && fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-xl p-4 transition text-center cursor-pointer ${
          disabled ? 'bg-slate-100 opacity-60 cursor-not-allowed' : ''
        } ${
          isDragging
            ? 'border-emerald-500 bg-emerald-50/50'
            : selectedFile
            ? 'border-emerald-400 bg-emerald-50/20'
            : currentFileUrl
            ? 'border-orange-300 bg-orange-50/20'
            : 'border-slate-300 hover:border-emerald-400 bg-slate-50/50 hover:bg-slate-50'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          onChange={handleInputChange}
          className="hidden"
          disabled={disabled}
        />

        {selectedFile ? (
          /* Archivo Seleccionado Nuevo */
          <div className="flex items-center justify-between bg-white p-3 rounded-lg border border-emerald-200 shadow-2xs">
            <div className="flex items-center space-x-3 truncate">
              <div className="p-2 rounded-lg bg-emerald-100 text-emerald-700">
                {isImage(selectedFile) ? (
                  <ImageIcon className="w-5 h-5" />
                ) : (
                  <File className="w-5 h-5" />
                )}
              </div>
              <div className="text-left truncate">
                <div className="text-xs font-bold text-slate-900 truncate">
                  {selectedFile.name}
                </div>
                <div className="text-[10px] text-slate-500">
                  {formatFileSize(selectedFile.size)} • Listo para subir
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <span className="badge-green text-[10px] flex items-center">
                <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-600" />
                Seleccionado
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onFileSelect(null);
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : currentFileUrl ? (
          /* Archivo Existente Registrado */
          <div className="flex items-center justify-between bg-white p-3 rounded-lg border border-orange-200 shadow-2xs">
            <div className="flex items-center space-x-3 truncate">
              <div className="p-2 rounded-lg bg-orange-100 text-orange-700">
                <File className="w-5 h-5" />
              </div>
              <div className="text-left truncate">
                <div className="text-xs font-bold text-slate-900 truncate">
                  Firma o archivo actual guardado
                </div>
                
              </div>
            </div>

            <span className="badge-orange text-[10px]">
              Reemplazar haciendo clic
            </span>
          </div>
        ) : (
          /* Estado Vacío por Defecto */
          <div className="py-2 space-y-1.5 pointer-events-none">
            <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
              <UploadCloud className="w-5 h-5" />
            </div>
            <div className="text-xs font-bold text-slate-800">{hint}</div>
            <div className="text-[11px] text-slate-400">
              Soporta imágenes (PNG, JPG) o documentos (PDF)
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
