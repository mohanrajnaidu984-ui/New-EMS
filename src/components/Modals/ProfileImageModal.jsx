import React, { useState, useRef, useEffect } from 'react';
import Modal from './Modal';
import Draggable from 'react-draggable';
import { useAuth } from '../../context/AuthContext';

const ProfileImageModal = ({ show, onClose, onSave }) => {
    const [image, setImage] = useState(null);
    const [scale, setScale] = useState(1);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const fileInputRef = useRef(null);
    const imageRef = useRef(null);
    const containerRef = useRef(null);
    const [loading, setLoading] = useState(false);

    const handleFileChange = (e) => {
        if (e.target.files && e.target.files.length > 0) {
            const reader = new FileReader();
            reader.addEventListener('load', () => setImage(reader.result));
            reader.readAsDataURL(e.target.files[0]);
            setScale(1);
            setPosition({ x: 0, y: 0 });
        }
    };

    const handleWheel = (e) => {
        e.preventDefault();
        const sc = scale + (e.deltaY * -0.001);
        setScale(Math.min(Math.max(1, sc), 3));
    };

    const handleSave = async () => {
        if (!image) return;
        setLoading(true);

        const canvas = document.createElement('canvas');
        const size = 200; // Output size
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        const img = new Image();
        img.src = image;

        img.onload = () => {
            // Calculate crop based on position and scale
            // The container is 250x250 (defined in CSS below)
            // The image is scaled and translated.
            // We need to draw the visible portion of the image into the 200x200 canvas.

            // Actually, easier approach:
            // 1. Draw image to canvas with transformations.

            // The container size 
            const containerSize = 250;
            const relativeScale = size / containerSize;

            // Clear canvas
            ctx.clearRect(0, 0, size, size);
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, size, size);

            // Calculate where to draw
            // position.x and position.y are the offsets in the 250px container

            // We want to map the view in the 250px container to the 200px canvas

            // Draw logic:
            // ctx.drawImage(img, dx, dy, dWidth, dHeight)
            // effective width/height of image on screen = naturalWidth * scale * (containerWidth / naturalWidth? No, we set width to 100% usually)
            // user adjusts scale.

            // Let's assume image fits width or height.
            // Simplified:
            // The Draggable component applies transform: translate(x, y). 
            // We need to apply the same transform to drawing.

            // Let's assume the image is rendered with explicit width/height in the container based on aspect ratio?
            // To make it robust:
            // 1. Calculate the aspect ratio of the image.
            // 2. Determine rendered width/height in the container (before scale).
            // 3. Apply scale and translation.

            const aspect = img.naturalWidth / img.naturalHeight;
            let renderedWidth, renderedHeight;

            if (aspect > 1) {
                renderedHeight = containerSize;
                renderedWidth = renderedHeight * aspect;
            } else {
                renderedWidth = containerSize;
                renderedHeight = renderedWidth / aspect;
            }

            // Current transform: translate(position.x, position.y) scale(scale)
            // We want to draw onto a 200x200 canvas which corresponds to the 250x250 view.

            ctx.save();
            // Clip to circle? Requirement didn't say circle, but profile usually is.
            // Let's stick to square for now as per requirement "crop".

            // Translate to center first? No, Drag starts at 0,0.

            // Check draggable bounds?
            // Since we use react-draggable, we just take x/y.

            // Mapping 250px view coords to 200px canvas coords: factor = 0.8
            const factor = size / containerSize;

            ctx.scale(factor, factor);
            ctx.translate(position.x, position.y);
            // Scale from the center of the image? 
            // Draggable usually moves the element. Transform origin is usually center?
            // We'll set transform-origin to center in CSS.
            // In canvas, translate to center of image, scale, translate back.

            // Let's try simple:
            // The image top-left is at (position.x, position.y) relative to container top-left.
            // It has size (renderedWidth * scale, renderedHeight * scale).
            // Wait, if transform-origin is center (default for some), scale expands from center.
            // We will set transform-origin: top left to make math easier.

            ctx.scale(scale, scale);
            ctx.drawImage(img, 0, 0, renderedWidth, renderedHeight);

            ctx.restore();

            const base64 = canvas.toDataURL('image/jpeg', 0.8);
            onSave(base64);
            setLoading(false);
            onClose();
        };
    };

    return (
        <Modal
            show={show}
            title="Update Profile Picture"
            onClose={onClose}
            footer={
                <>
                    <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
                    <button className="btn btn-primary" onClick={handleSave} disabled={!image || loading}>
                        {loading ? 'Saving...' : 'Save & Update'}
                    </button>
                </>
            }
        >
            <div className="d-flex flex-column align-items-center">
                {!image ? (
                    <div
                        className="d-flex align-items-center justify-content-center bg-light border border-dashed rounded mb-3"
                        style={{ width: '250px', height: '250px', cursor: 'pointer' }}
                        onClick={() => fileInputRef.current.click()}
                    >
                        <div className="text-center text-secondary">
                            <i className="bi bi-camera fs-1"></i>
                            <p className="mb-0 mt-2">Click to upload</p>
                        </div>
                    </div>
                ) : (
                    <div className="mb-3 position-relative" style={{ width: '250px', height: '250px', overflow: 'hidden', border: '2px solid #ddd', borderRadius: '50%' }}>
                        {/* Container is circular to show how it looks as profile */}
                        <Draggable
                            nodeRef={imageRef}
                            position={position}
                            onDrag={(e, data) => setPosition({ x: data.x, y: data.y })}
                        >
                            <img
                                ref={imageRef}
                                src={image}
                                alt="Crop Preview"
                                style={{
                                    maxWidth: 'none',
                                    /* Logic to fit at least one dimension */
                                    height: '250px', // Default fit height, width auto
                                    transformOrigin: 'top left', // Important for math above
                                    transform: `scale(${scale})`,
                                    cursor: 'move',
                                    userSelect: 'none'
                                }}
                                draggable={false}
                            />
                        </Draggable>
                    </div>
                )}

                <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept="image/*"
                    className="d-none"
                />

                {image && (
                    <div className="w-75 mb-3">
                        <label className="form-label text-muted small">Zoom</label>
                        <input
                            type="range"
                            className="form-range"
                            min="1"
                            max="3"
                            step="0.1"
                            value={scale}
                            onChange={(e) => setScale(parseFloat(e.target.value))}
                        />
                        <div className="text-center mt-2">
                            <button className="btn btn-sm btn-outline-secondary" onClick={() => { setImage(null); }}>
                                Change Image
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    );
};

export default ProfileImageModal;
