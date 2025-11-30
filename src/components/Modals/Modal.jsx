import React, { useRef } from 'react';
import Draggable from 'react-draggable';

const Modal = ({ show, title, onClose, children, footer }) => {
    const nodeRef = useRef(null);

    if (!show) return null;

    return (
        <div className="modal d-block show" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
            <Draggable nodeRef={nodeRef} handle=".modal-header">
                <div ref={nodeRef} className="modal-dialog modal-lg">
                    <div className="modal-content">
                        <div className="modal-header" style={{ cursor: 'move' }}>
                            <h5 className="modal-title">{title}</h5>
                            <button type="button" className="btn-close" aria-label="Close" onClick={onClose}></button>
                        </div>
                        <div className="modal-body">
                            {children}
                        </div>
                        {footer && (
                            <div className="modal-footer">
                                {footer}
                            </div>
                        )}
                    </div>
                </div>
            </Draggable>
        </div>
    );
};

export default Modal;
